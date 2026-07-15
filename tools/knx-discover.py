#!/usr/bin/env python3
"""KNXnet/IP-Interfaces im Netz finden (SEARCH_REQUEST, Multicast).

Sendet einen KNXnet/IP-SEARCH an 224.0.23.12:3671 und listet alle antwortenden
Interfaces/Router mit IP, Port und Gerätename — die IP traegst du dann als
FACHWERK_KNX_HOST ein. Nur Standardbibliothek.

Aufruf:  python knx-discover.py            (5 s lauschen)
         python knx-discover.py --timeout 8
"""
import argparse
import socket
import struct
import sys

MCAST = ("224.0.23.12", 3671)
SEARCH_REQUEST = 0x0201
SEARCH_RESPONSE = 0x0202


def lokale_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(MCAST)          # kein echter Traffic, nur Routing-Auswahl
        return s.getsockname()[0]
    finally:
        s.close()


def search_request(ip: str, port: int) -> bytes:
    # Header (6) + HPAI (8: len, protocol=UDP(0x01), IP(4), Port(2))
    hpai = struct.pack("!BB4sH", 0x08, 0x01, socket.inet_aton(ip), port)
    header = struct.pack("!BBHH", 0x06, 0x10, SEARCH_REQUEST, 6 + len(hpai))
    return header + hpai


def geraetename(body: bytes) -> str:
    # Nach der Control-HPAI (8 Byte) folgen DIBs; DEVICE_INFO (Typ 0x01) enthaelt
    # am Ende 30 Byte Friendly Name.
    i = 8
    while i + 2 <= len(body):
        dlen, dtyp = body[i], body[i + 1]
        if dlen == 0:
            break
        if dtyp == 0x01 and i + dlen <= len(body):
            name = body[i + dlen - 30 : i + dlen]
            return name.split(b"\x00", 1)[0].decode("latin1", "replace").strip()
        i += dlen
    return "?"


def main() -> int:
    ap = argparse.ArgumentParser(description="KNXnet/IP-Interfaces finden")
    ap.add_argument("--timeout", type=float, default=5.0, help="Lauschdauer in Sekunden")
    a = ap.parse_args()

    ip = lokale_ip()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    s.bind((ip, 0))
    port = s.getsockname()[1]
    s.sendto(search_request(ip, port), MCAST)
    s.settimeout(a.timeout)

    print(f"Suche KNXnet/IP-Interfaces (von {ip}:{port}, {a.timeout:.0f}s) …\n")
    gefunden = {}
    while True:
        try:
            data, addr = s.recvfrom(1024)
        except socket.timeout:
            break
        if len(data) >= 8 and struct.unpack("!H", data[2:4])[0] == SEARCH_RESPONSE:
            body = data[6:]
            # Control-HPAI: IP+Port des Interface
            cip = socket.inet_ntoa(body[2:6])
            cport = struct.unpack("!H", body[6:8])[0]
            gefunden[(cip, cport)] = geraetename(body)

    if not gefunden:
        print("Kein Interface gefunden. (Anderes Subnetz? Multicast blockiert? "
              "Interface aus? Dann IP aus Router-Weboberflaeche/ETS nehmen.)")
        return 1
    for (cip, cport), name in sorted(gefunden.items()):
        print(f"  {cip}:{cport}   {name}")
    print("\n→ Diese IP als FACHWERK_KNX_HOST verwenden (Port meist 3671).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
