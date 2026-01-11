import asyncio
import queue
import concurrent
import logging
import threading
from bleak import BleakClient, BleakScanner
from .rome_setup import rome
from .server import GuiliRequestHandler, GuiliServer

logger = logging.getLogger("guili.ble")


SERVICE_ROME_UUID = "81870000-ffa5-4969-9ab4-e777ca411f95"
CHAR_ROME_TELEMETRY_UUID = "81870001-ffa5-4969-9ab4-e777ca411f95"
CHAR_ROME_ORDERS_UUID = "81870002-ffa5-4969-9ab4-e777ca411f95"


class BleCentral:
    """
    Manage BLE clients, send envents on frame

    `start()` can be called in a thread.
    Public methods are thread safe.
    """

    def __init__(self, server: "BleGuiliServer", devices: list[str] | None):
        self.server = server
        self.clients: dict[str, BleakClient] = {}
        self.filtered_devices = devices
        self.loop = None
        self.scan_future = None
        self.thread = None

    def start(self):
        """Start the BLE central in a thread"""

        if self.thread is not None or self.loop is not None:
            raise RuntimeError("Already started")

        logger.info("Start central thread")
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self._run_forever, daemon=True)
        self.thread.start()

    def stop(self):
        """Stop the BLE central async loop"""

        if self.loop is None:
            raise RuntimeError("Not started")
        logger.info("Stop central loop and thread")
        self.loop.stop()
        self.loop = None
        if self.thread is not None:
            self.thread.join()
            self.thread = None

    def _run_forever(self):
        """Start and run the BLE central async loop"""

        try:
            # `self.loop` is set by the caller, to ensure it's available immediately to other threads
            assert self.loop is not None
            self.loop.run_forever()
            self.loop = None
            logger.info("Central loop ended")
        except Exception:
            logger.exception("Central loop failed")
            raise

    def scan(self, delay: float):
        """Scan for devices for a given duration, thread safe"""

        if self.loop is None:
            raise RuntimeError("BLE central not started")
        if self.scan_future and not self.scan_future.done():
            logger.debug("Cancel current scan")
            self.scan_future.cancel()
            if not self.scan_future.done():
                raise RuntimeError("Failed to cancel scan future")
        self.scan_future = asyncio.run_coroutine_threadsafe(self._do_scan(delay), self.loop)
        self.scan_future.add_done_callback(self._future_callback)

    def send_frame(self, robot: str | None, frame: rome.Frame) -> None:
        """Send a frame to one or all robots, thread safe"""

        if self.loop is None:
            raise RuntimeError("BLE central not started")
        future = asyncio.run_coroutine_threadsafe(self._do_send_frame(robot, frame), self.loop)
        future.add_done_callback(self._future_callback)

    def filter_device(self, device) -> bool:
        """Filter a scanned device, return True we should connect to it"""
        if self.filtered_devices is None:
            return True
        else:
            return device.name in self.filtered_devices or device.address in self.filtered_devices

    async def _do_scan(self, delay: float):
        """Start a scan, connect to known devices"""

        logger.info(f"Start scan ({delay}s)")
        async with BleakScanner(service_uuids=[SERVICE_ROME_UUID]) as scanner:
            try:
                async with asyncio.timeout(delay):
                    async for device, data in scanner.advertisement_data():
                        logger.debug("Advertisement from %r: %r", device, data)
                        if device.address in self.clients:
                            continue  # Already connected
                        if not self.filter_device(device):
                            continue
                        logger.info(f"Connecting to {device.address} {device.name!r} ...")
                        client = BleakClient(device, services=[SERVICE_ROME_UUID], disconnected_callback=self._on_disconnected_client)
                        await client.connect()
                        # Sometimes, services are not correctly retrieved and thus the device cannot be used
                        if not client.services.get_characteristic(CHAR_ROME_TELEMETRY_UUID):
                            logger.warn(f"Missing ROME characteristic on {device.address} {device.name!r}, abort connection")
                            await client.disconnect()
                            continue
                        logger.info(f"Connected to {device.address} {device.name!r}")
                        self.clients[device.address] = client
                        self._update_server_robots()
                        #TODO Set MTU?
                        async def telemetry_callback(_sender, data: bytes):
                            await self._on_rome_telemetry(client, data)
                        await client.start_notify(CHAR_ROME_TELEMETRY_UUID, telemetry_callback)
            except TimeoutError:
                pass
        logger.info("End of scan")

    async def _do_send_frame(self, robot: str | None, frame: rome.Frame) -> None:
        data = frame.encode()
        clients: list[BleakClient] = [self.clients.get(robot)] if robot is not None else self.clients.values()
        promises = [c.write_gatt_char(CHAR_ROME_ORDERS_UUID, data) for c in clients if c]
        if not promises:
            return  # Nobody to send to
        await asyncio.gather(*promises)

    def _on_disconnected_client(self, client: BleakClient) -> None:
        logger.warn(f"Client disconnected: {client.address} ({client.name!r})")
        if client.address not in self.clients:
            return  # May happen if client has not the required characteristics yet
        del self.clients[client.address]
        self._update_server_robots()

    async def _on_rome_telemetry(self, client: BleakClient, data: bytes) -> None:
        try:
            frame = rome.Message.decode(data)
        except Exception as e:
            logger.error(f"Invalid ROME frame: {e}")
            return
        logger.debug("ROME frame from %r: %s", client.name, frame)
        self.server.queue.put_nowait(("on_frame", client.name, frame))

    def _future_callback(self, future: concurrent.futures.Future) -> None:
        """Generic callback for futures, to report errors"""
        assert future.done()
        try:
            ex = future.exception(0)
        except concurrent.futures.CancelledError:
            return  # Ignore
        if ex is not None:
            logger.error("Future failed", exc_info=ex)

    def _update_server_robots(self) -> None:
        """Update robots on the Guili server"""
        robots = [c.name for c in self.clients.values()]
        self.server.queue.put_nowait(("update_robots", robots))


class BleGuiliServer(GuiliServer):
    class GuiliRequestHandlerClass(GuiliRequestHandler):
        server: "BleGuiliServer"

        def wsdo_rome(self, robot: str, name: str, args: rome.Arguments) -> None:
            message = frame = rome.Message[name]
            if isinstance(args, dict):
                frame = message(**args)
            else:
                frame = message(*args)
            self.server.central.send_frame(robot, frame)

        def wsdo_scan(self) -> None:
            """Start a scan"""
            self.server.central.scan(30)

    def __init__(self, addr: tuple[str, int], devices: list[str]):
        super().__init__(addr, [])
        #TODO Names are not known immediately
        self.central = BleCentral(self, devices)
        # Queue filled by the central and consumed by this instance
        self.queue = queue.SimpleQueue()

    def start(self):
        self.central.start()
        _queue_thread = threading.Thread(target=self._consume_queue, daemon=True)
        _queue_thread.start()
        #TODO Add a button in UI to start a scan
        #TODO At startup, scan until at least one robot is found
        self.central.scan(60)
        super().start()

        # Note: threads are never collected/stopped properly
        # In practice, it's not a problem, since they are daemon threads

    def _consume_queue(self):
        """Thread routine to consume queue"""

        while True:
            method_name, *args = self.queue.get()
            method = getattr(self, method_name, None)
            if method is None or not callable(method):
                raise ValueError(f"Invalid queued method: {method_name}")
            method(*args)
            assert self.queue.qsize() < 100  # Safety check

