import asyncio
import queue
import concurrent
import threading
from bleak import BleakClient, BleakScanner
from .rome_setup import rome
from .server import GuiliRequestHandler, GuiliServer


SERVICE_ROME_UUID = "81870000-ffa5-4969-9ab4-e777ca411f95"
CHAR_ROME_TELEMETRY_UUID = "81870001-ffa5-4969-9ab4-e777ca411f95"
CHAR_ROME_ORDERS_UUID = "81870002-ffa5-4969-9ab4-e777ca411f95"


class BleCentral:
    """
    Manage BLE clients, send envents on frame

    `start()` can be called in a thread.
    Public methods are thread safe.
    """

    def __init__(self, server: "BleGuiliServer", addresses: list[str]):
        #TODO Add an option to connect to any device with matching service
        self.server = server
        self.clients: dict[str, BleakClient | None] = {addr.upper(): None for addr in addresses}
        self.loop = None
        self.scan_future = None
        self.thread = None

    def start(self):
        """Start the BLE central in a thread"""

        if self.thread is not None or self.loop is not None:
            raise RuntimeError("Already started")

        print("BLE: start central thread")
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self._run_forever, daemon=True)
        self.thread.start()

    def stop(self):
        """Stop the BLE central async loop"""
        if self.loop is None:
            raise RuntimeError("Not started")
        print("BLE: stop central loop and thread")
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
            print("BLE: central loop thread ended")
        except Exception as e:
            print(f"BLE: central loop thread error: {e}")
            raise

    def scan(self, delay: float):
        """Scan for devices for a given duration, thread safe"""

        if self.loop is None:
            raise RuntimeError("BLE central not started")
        if self.scan_future and not self.scan_future.done():
            print("BLE: cancel current scan")
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

    async def _do_scan(self, delay: float):
        """Start a scan, connect to known devices"""

        print("BLE: start scan")
        async with BleakScanner(service_uuids=[SERVICE_ROME_UUID]) as scanner:
            try:
                async with asyncio.timeout(delay):
                    async for device, _data in scanner.advertisement_data():
                        print("DEBUG: advertisement", device, _data)
                        if device.address not in self.clients:
                            return
                        if self.clients[device.address] is not None:
                            return  # Already connected
                        print(f"BLE: connecting to {device.address} ({device.name!r}) ...")
                        client = BleakClient(device, disconnected_callback=self._on_disconnected_client)
                        await client.connect()
                        print(f"BLE: connected to {device.address} ({device.name!r})")
                        self.clients[device.address] = client
                        self._update_server_robots()
                        #TODO Set MTU?
                        async def telemetry_callback(_sender, data: bytes):
                            await self._on_rome_telemetry(client, data)
                        await client.start_notify(CHAR_ROME_TELEMETRY_UUID, telemetry_callback)
            except TimeoutError:
                pass
        print("BLE: end of scan")

    async def _do_send_frame(self, robot: str | None, frame: rome.Frame) -> None:
        data = frame.encode()
        clients: list[BleakClient] = [self.clients.get(robot) if robot is not None else self.clients.values()]
        promises = [c.write_gatt_char(CHAR_ROME_ORDERS_UUID, data) for c in clients if c is not None]
        if not promises:
            return  # Nobody to send to
        await asyncio.gather(*promises)

    def _on_disconnected_client(self, client: BleakClient) -> None:
        print(f"BLE: client disconnected: {client.address} ({client.name!r})")
        assert client.address in self.clients
        self.clients[client.address] = None
        self._update_server_robots()

    async def _on_rome_telemetry(self, client: BleakClient, data: bytes) -> None:
        try:
            frame = rome.Message.decode(data)
        except Exception as e:
            print(f"Invalid frame: {e}")
            return
        print(f"BLE: ROME frame from {client.name}: {frame}")
        self.server.queue.put_nowait(("on_frame", client.name, frame))

    def _future_callback(self, future: concurrent.futures.Future) -> None:
        """Generic callback for futures, to report errors"""
        assert future.done()
        ex = future.exception(0)
        if ex is not None:
            #TODO Log to the WS
            #TODO Use proper logging
            import traceback
            traceback.print_exception(ex)
            print(f"BLE: future error: {ex}")

    def _update_server_robots(self) -> None:
        """Update robots on the Guili server"""
        robots = [c.name for c in self.clients.values() if c]
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
        self.central.scan(30)
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

