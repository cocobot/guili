import io
import json
import mimetypes
import os
import posixpath
import shutil
import threading
import time
import traceback
import urllib
from pathlib import Path, PurePosixPath
from socketserver import ThreadingMixIn
from .rome_setup import rome
from .websocket import WebSocketServer, WebSocketRequestHandler

# Base directory of served files
WEB_FILES_PATH = Path(__file__).parent / "web"

# No bootloader for now
bootloader = None


class GuiliRequestHandler(WebSocketRequestHandler):
    """
    Guili request handler

    Messages are json-encoded maps with the following fields:
        method -- message type
        params -- map of message parameters

    When receiving a message with method 'method', the 'wsdo_method' method is
    called with 'params' as keyword parameters.

    Attributes:
        lock -- lock for concurrent accesses
        paused -- client is paused

    """

    redirects = {
        '/': '/guili/',
        '/guili': '/guili/',
    }
    ws_prefix = 'ws'
    files_prefix = 'guili'
    files_extensions = ['.html', '.css', '.js', '.svg', '.png', '.eot', '.ttf', '.woff', '.woff2']
    files_index = 'guili.html'
    bootloader_prefix = 'bl'

    server: "GuiliServer"

    def do_GET(self):
        # remove query and normalize the path
        path = self.path.split('?', 1)[0]
        if path in self.redirects:
            return self.handle_redirect(self.redirects[path])
        path = posixpath.normpath(urllib.parse.unquote(path))
        path = path.strip('/')

        # dispatch to the correct handler
        if self.command == 'GET' and path == self.ws_prefix:
            return self.handle_websocket()
        parts = path.split('/', 1)
        prefix = parts[0]
        subpath = parts[1] if len(parts) > 1 else ''
        if prefix == self.files_prefix:
            return self.handle_files(subpath)
        elif prefix == self.bootloader_prefix:
            return self.handle_bootloader(subpath)
        else:
            return self.send_error(404)

    do_POST = do_GET


    def handle_redirect(self, target):
        host = self.headers['host']
        self.send_response(301)
        self.send_header('Location', 'http://' + host + target)
        self.end_headers()


    def handle_files(self, path):
        if self.command != 'GET':
            return self.send_error(405)

        # Build filesystem path from (sanitized) request path
        parts = PurePosixPath(path or self.files_index).parts
        parts = [p for p in parts if p != '/' and not p.startswith('.')]
        fspath = WEB_FILES_PATH / PurePosixPath(*parts)

        # Filter by extension
        if fspath.suffix not in self.files_extensions:
            return self.send_error(404)

        try:
            f = fspath.open('rb')
        except FileNotFoundError:
            return self.send_error(404)
        with f:
            # Send HTTP reply
            mimetype = mimetypes.types_map.get(fspath.suffix, 'application/octet-stream')
            self.send_response(200)
            self.send_header('Content-type', mimetype)
            fstat = os.fstat(f.fileno())
            self.send_header('Content-Length', str(fstat[6]))
            self.end_headers()
            # Output file content
            shutil.copyfileobj(f, self.wfile)


    def handle_bootloader(self, path):
        if self.command != 'POST':
            return self.send_error(405)

        #TODO Lock the robot list
        robot = None
        if path == 'program' and len(self.server.robots):
            robot = self.server.robots[0]
        elif path.startswith('program/'):
            robot = path.split('/', 1)[1]

        if robot is None or robot not in self.server.robots:
            return self.send_error(404)

        content_length = int(self.headers['content-length'])
        data = io.BytesIO(self.rfile.read(content_length))
        return self.bootloader_program(robot, data)

    def bootloader_program(self, robot, fhex):
        if bootloader is None:
            return self.send_error(400, "Bootloader client not found")

    def ws_setup(self):
        self.lock = threading.RLock()
        self.paused = True

    def ws_finish(self):
        with self.server.lock:
            self.server.requests.discard(self)

    def send_event(self, name, params):
        """Send an event"""
        with self.lock:
            self.ws_send_frame(1, json.dumps({'event': name, 'params': params}))

    def on_message(self, fo) -> None:
        data = json.loads(fo.read().decode('utf-8'))
        try:
            getattr(self, 'wsdo_'+data['method'].replace('-', '_'))(**data['params'])
        except Exception as e:
            traceback.print_exc()
            self.send_event('log', {'severity': 'error', 'message': "%s: %s" % (e.__class__.__name__, str(e))})

    def wsdo_init(self):
        """Initialize a client"""
        self.paused = False
        with self.server.lock:
            self.server.requests.add(self)

    def wsdo_robots(self):
        """Send list of handled robots"""
        with self.lock:
            self.send_event('robots', {'robots': self.server.robots})

    def wsdo_pause(self, paused):
        """Pause or unpause a client"""
        self.paused = bool(paused)

    def wsdo_rome(self, robot: str, name: str, args: rome.Arguments) -> None:
        """Send a ROME message"""
        raise NotImplementedError

    def wsdo_rome_messages(self):
        """Send ROME message definitions"""
        messages = {msg.name: msg.params for msg in rome.messages.values()}
        self.send_event('messages', {'messages': messages})

    def wsdo_configurations(self):
        """Send portlets configurations"""
        self.send_event('configurations', {'configurations': self.server.configurations})


class GuiliServer(ThreadingMixIn, WebSocketServer):
    """
    Guili application server

    Attributes:
        lock -- lock for concurrent accesses
        requests -- set of request handlers of initialized clients
        robots -- list of handled robots
        configurations -- list of portlets configurations

    """

    daemon_threads = True
    GuiliRequestHandlerClass = GuiliRequestHandler

    def __init__(self, addr: tuple[str, int], robots: list[str]):
        super().__init__(addr, self.GuiliRequestHandlerClass)
        self.data = None
        self.requests = set()
        self.lock = threading.RLock()
        self.robots = robots
        # load configurations
        try:
            with (Path(__file__).parent / 'configurations.json').open() as f:
                self.configurations = json.load(f)
        except IOError:
            self.configurations = {}
        # Mimetypes are used by the request handler, initialize them
        if not mimetypes.inited:
            mimetypes.init()

    def update_robots(self, robots: list[str]) -> None:
        """Update the list of robots"""
        with self.lock:
            self.robots = robots
            for r in self.requests:
                pass #TODO self.send_event('robots', self.robots)

    def on_frame(self, robot: str, frame: rome.Frame):
        data = {'robot': robot, 'name': frame.message.name, 'args': frame.args}
        with self.lock:
            for r in self.requests:
                if not r.paused:
                    r.send_event('frame', data)

    def start(self):
        self.serve_forever()


class TestGuiliServer(GuiliServer):
    """
    Dummy server, for tests
    """

    class GuiliRequestHandlerClass(GuiliRequestHandler):
        def wsdo_rome(self, robot: str, name: str, args: rome.Arguments) -> None:
            print("ROME[%s]: %s %r" % ('' if robot is None else robot, name, args))

    def __init__(self, addr: tuple[str, int], devices: list[str]):
        # Note: for a test server, devices are directly names, not addresses
        super().__init__(addr, devices)
        # Define only our messages
        rome.register_messages(self.default_messages(), append=False)
        self._frame_threads = [
            TickThread(0.1, self.on_robot_event, [d, self.gen_frames(i, d)])
            for i, d in enumerate(devices)
        ]

    @staticmethod
    def default_messages() -> list[rome.Message]:
        content = """
            90:
              AsservTelemetry:
                x: f32
                y: f32
                a: f32
                done: bool
              AsservTmCarrot:
                x: f32
                y: f32
              OrderDummy: [f32, u8]
        """
        return rome.load_messages(io.StringIO(content))

    def start(self):
        for th in self._frame_threads:
            th.start()
        GuiliServer.start(self)

    def on_robot_event(self, robot: str, gen_frame):
        """Called on new event from a robot"""
        while True:
            frame = next(gen_frame)
            if frame is None:
                break
            self.on_frame(robot, frame)

    def gen_frames(self, idev: int, robot):
        import itertools
        import math
        r = 600 / (idev + 1)
        N = int(100 // (idev + 1))
        def angle(i: int):
            return 2 * i * math.pi / N

        for i in itertools.cycle(range(N)):
            #TODO Log
            #if i == 0:
            #    yield rome.Frame('log', 'notice', "%s: new turn" % robot)
            #elif i == N//2:
            #    yield rome.Frame('log', 'info', "%s: half turn" % robot)
            # Asserv carrot
            if i % (N//6) == 0:
                a = angle((i + N//6) % N)
                yield rome.Message["AsservTmCarrot"](x = r * math.cos(a), y = r * math.sin(a) + 1000)
            # Asserv position
            yield rome.Message["AsservTelemetry"](
                x = r * math.cos(angle(i)),
                y = r * math.sin(angle(i)) + 1000,
                a = math.pi*(2.0*i/N),
                done = False,
            )
            yield None


class TickThread(threading.Thread):
    """
    Dummy thread to trigger periodic GulliServer.on_robot_event() calls
    """

    def __init__(self, dt, callback, args):
        threading.Thread.__init__(self)
        self.callback = callback
        self.args = args
        self.dt = dt
        self.daemon = True

    def run(self):
        while True:
            self.callback(*self.args)
            time.sleep(self.dt)

