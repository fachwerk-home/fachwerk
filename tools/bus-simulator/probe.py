#!/usr/bin/env python3
"""Fern-Probe fuer einen laufenden KNXnet/IP-Simulator (oder echtes Gateway).

Verbindet sich als Tunneling-Client gegen host:port und prueft den Handshake:
CONNECT -> CONNECTIONSTATE -> (optional TUNNELING L_Data.req) -> DISCONNECT.

Nutzung:
    python probe.py <sim-host> 3671
Exit 0 = ok, 1 = Fehler. Gut als Health-Check nach dem Deployment.
"""
import socket
import struct
import sys

from knxnet_sim import (
    _header, _hpai,
    CONNECT_REQUEST, CONNECT_RESPONSE,
    CONNECTIONSTATE_REQUEST, CONNECTIONSTATE_RESPONSE,
    DISCONNECT_REQUEST, DISCONNECT_RESPONSE,
    TUNNELING_REQUEST, TUNNELING_ACK,
    CONN_TYPE_TUNNEL, L_DATA_REQ, L_DATA_CON,
)

ANY_HPAI = _hpai("0.0.0.0", 0)


def recv(sock):
    data, _ = sock.recvfrom(1024)
    return struct.unpack("!H", data[2:4])[0], data[6:]


def main() -> int:
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 3671
    dest = (host, port)
    cli = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    cli.settimeout(3.0)
    ok = True

    def check(cond, label):
        nonlocal ok
        print(("PASS" if cond else "FAIL"), label)
        ok = ok and cond

    print(f"Probe gegen {host}:{port} ...")
    try:
        cri = struct.pack("!BBBB", 0x04, CONN_TYPE_TUNNEL, 0x02, 0x00)
        cli.sendto(_header(CONNECT_REQUEST, ANY_HPAI + ANY_HPAI + cri), dest)
        svc, body = recv(cli)
        channel = body[0]
        check(svc == CONNECT_RESPONSE and body[1] == 0x00, "CONNECT_RESPONSE, Status 0")
        check(channel != 0, f"Kanal zugewiesen ({channel})")

        cli.sendto(_header(CONNECTIONSTATE_REQUEST,
                           struct.pack("!BB", channel, 0x00) + ANY_HPAI), dest)
        svc, body = recv(cli)
        check(svc == CONNECTIONSTATE_RESPONSE and body[1] == 0x00,
              "CONNECTIONSTATE_RESPONSE, Status 0")

        ga = (1 << 11) | (2 << 8) | 3
        cemi = struct.pack("!BBBBHHB", L_DATA_REQ, 0x00, 0xBC, 0xE0, 0x0000, ga, 1)
        cemi += bytes([0x00, 0x81])
        cli.sendto(_header(TUNNELING_REQUEST,
                           struct.pack("!BBBB", 0x04, channel, 0x00, 0x00) + cemi), dest)
        got_ack = False
        for _ in range(2):
            try:
                svc, body = recv(cli)
            except socket.timeout:
                break
            if svc == TUNNELING_ACK:
                got_ack = body[3] == 0x00
        check(got_ack, "TUNNELING_ACK auf L_Data.req")

        cli.sendto(_header(DISCONNECT_REQUEST,
                           struct.pack("!BB", channel, 0x00) + ANY_HPAI), dest)
        svc, body = recv(cli)
        check(svc == DISCONNECT_RESPONSE, "DISCONNECT_RESPONSE")
    except socket.timeout:
        check(False, "Antwort erhalten (Timeout — Server nicht erreichbar?)")

    print("\n" + ("ERREICHBAR & KORREKT" if ok else "PROBLEM"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
