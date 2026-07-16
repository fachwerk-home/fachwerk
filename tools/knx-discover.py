#!/usr/bin/env python3
"""KNXnet/IP-Interfaces im Netz finden (SEARCH_REQUEST, Multicast).

Sendet einen KNXnet/IP-SEARCH an 224.0.23.12:3671 und listet alle antwortenden
Interfaces/Router mit IP, Port und Gerätename — die IP traegst du dann als
FACHWERK_KNX_HOST ein. Nur Standardbibliothek.

Aufruf:  python knx-discover.py                 (Multicast-Suche, 5 s)
         python knx-discover.py --timeout 8
         python knx-discover.py --host 192.168.11.12   (gezielt eine IP prüfen)

Der --host-Modus schickt einen DESCRIPTION_REQUEST (kein Tunnel, kein Slot) und
sagt, ob dort ein KNXnet/IP-Server antwortet — ideal, um .12/.13 abzuklopfen.
"""
import argparse
import socket
import struct
import sys

MCAST = ("224.0.23.12", 3671)
SEARCH_REQUEST = 0x0201
SEARCH_RESPONSE = 0x0202
DESCRIPTION_REQUEST = 0x0203
DESCRIPTION_RESPONSE = 0x0204


try:  # Umlaute/Pfeile auch auf cp1252-Konsolen (Windows) ausgeben
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def lokale_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(MCAST)          # kein echter Traffic, nur Routing-Auswahl
        return s.getsockname()[0]
    finally:
        s.close()


def hpai(ip: str, port: int) -> bytes:
    """HPAI (len, Protokoll UDP, IP, Port). 0.0.0.0:0 = NAT-Modus: der Server
    antwortet an die Paketquelle — robust bei mehreren Netzwerkadaptern."""
    return struct.pack("!BB4sH", 0x08, 0x01, socket.inet_aton(ip), port)


def search_request(ip: str, port: int) -> bytes:
    body = hpai(ip, port)
    header = struct.pack("!BBHH", 0x06, 0x10, SEARCH_REQUEST, 6 + len(body))
    return header + body


def description_request(ip: str, port: int) -> bytes:
    body = hpai(ip, port)
    header = struct.pack("!BBHH", 0x06, 0x10, DESCRIPTION_REQUEST, 6 + len(body))
    return header + body


def geraetename(body: bytes, start: int = 8) -> str:
    # DIBs ab `start` (SEARCH_RESPONSE: nach Control-HPAI=8; DESCRIPTION: ab 0).
    # DEVICE_INFO (Typ 0x01) enthaelt am Ende 30 Byte Friendly Name.
    i = start
    while i + 2 <= len(body):
        dlen, dtyp = body[i], body[i + 1]
        if dlen == 0:
            break
        if dtyp == 0x01 and i + dlen <= len(body):
            name = body[i + dlen - 30 : i + dlen]
            return name.split(b"\x00", 1)[0].decode("latin1", "replace").strip()
        i += dlen
    return "?"


def pruefe_host(host: str, port: int, timeout: float) -> int:
    """Gezielter DESCRIPTION_REQUEST an EINE IP (kein Tunnel, kein Slot).

    NAT-Modus (HPAI 0.0.0.0:0) + Bind auf alle Adapter: funktioniert auch auf
    Rechnern mit mehreren Interfaces (Docker/WSL/VPN), wo das Erraten der
    lokalen IP danebengeht.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("0.0.0.0", 0))
    s.settimeout(timeout)
    print(f"Prüfe {host}:{port} (DESCRIPTION_REQUEST, NAT-Modus) …\n")
    try:
        s.sendto(description_request("0.0.0.0", 0), (host, port))
    except OSError as e:
        print(f"  Netzwerkfehler: {e}")
        print(f"  → {host} nicht erreichbar (falsches Subnetz? läuft der Host?).")
        return 1
    while True:
        try:
            data, _ = s.recvfrom(1024)
        except socket.timeout:
            print(f"  Keine KNXnet/IP-Antwort von {host}:{port}.")
            print("  → Dort läuft (vermutlich) KEIN KNX/IP-Server, oder er ist aus/"
                  "blockiert/KNX-Secure.")
            return 1
        if len(data) >= 8 and struct.unpack("!H", data[2:4])[0] == DESCRIPTION_RESPONSE:
            name = geraetename(data[6:], start=0)
            print(f"  KNXnet/IP-Server gefunden: {name}")
            print(f"  → {host} als FACHWERK_KNX_HOST nutzbar (Port {port}).")
            return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="KNXnet/IP-Interfaces finden")
    ap.add_argument("--timeout", type=float, default=5.0, help="Lauschdauer in Sekunden")
    ap.add_argument("--host", help="gezielt EINE IP prüfen (statt Multicast-Suche)")
    ap.add_argument("--port", type=int, default=3671, help="Port (Default 3671)")
    ap.add_argument("--iface", help="lokale IP des Netzwerkadapters erzwingen "
                                    "(bei mehreren Adaptern: Docker/WSL/VPN)")
    a = ap.parse_args()

    if a.host:
        return pruefe_host(a.host, a.port, a.timeout)

    ip = a.iface or lokale_ip()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(ip))
    s.bind((ip, 0))
    port = s.getsockname()[1]
    # NAT-HPAI: Antwort geht an die Paketquelle (robust bei mehreren Adaptern).
    s.sendto(search_request("0.0.0.0", 0), MCAST)
    s.settimeout(a.timeout)

    print(f"Suche KNXnet/IP-Interfaces über Adapter {ip} ({a.timeout:.0f}s) …")
    print(f"(Falls {ip} nicht dein LAN-Adapter ist: --iface <deine-LAN-IP>)\n")
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
