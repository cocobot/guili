import argparse
import logging
import sys
from .ble import BleGuiliServer
from .rome_setup import rome
from .server import TestGuiliServer


def main():
    parser = argparse.ArgumentParser(prog='guili')
    parser.add_argument('port', type=int, help="guili WebSocket server port")
    parser.add_argument('devices', nargs='*', help="Devices' names or addresses to connect to, all with ROME service by default; use 'TEST' for a dummy packet generator")
    parser.add_argument('-v', '--verbose', action='store_true', help="Enable guili debug logs")

    args = parser.parse_args()

    rome.register_default_messages()

    logging.basicConfig(
        level = logging.WARNING,
        format = "%(asctime)s.%(msecs)03d | %(levelname)-8s | %(name)s: %(message)s",
        datefmt = "%H:%M:%S",
        stream = sys.stderr,
    )
    logger = logging.getLogger("guili")
    logger.setLevel(logging.DEBUG if args.verbose else logging.INFO)

    if args.devices and 'TEST' in args.devices:
        if len(args.devices) != 1:
            parser.error("Cannot mix test and regular devices")
        server_class = TestGuiliServer
    else:
        server_class = BleGuiliServer
    print(f"Starting server, UI available at http://127.0.0.1:{args.port}")
    server = server_class(('', args.port), args.devices)
    try:
        server.start()
    except KeyboardInterrupt:
        print("Interrupted")

if __name__ == '__main__':
    main()
