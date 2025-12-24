import argparse
from .ble import BleGuiliServer
from .rome_setup import rome
from .server import TestGuiliServer


def main():
    parser = argparse.ArgumentParser(prog='guili')
    parser.add_argument('port', type=int, help="guili WebSocket server port")
    parser.add_argument('devices', nargs='+', help="BLE addresses to connect to, 'TEST' for a dummy packet generator")

    args = parser.parse_args()

    rome.register_default_messages()

    is_test = 'TEST' in args.devices
    if is_test:
        if len(args.devices) != 1:
            parser.error("Cannot mix test and regular devices")
        server_class = TestGuiliServer
    else:
        server_class = BleGuiliServer
    print(f"Starting server on port {args.port}")
    server = server_class(('', args.port), args.devices)
    server.start()

if __name__ == '__main__':
    main()
