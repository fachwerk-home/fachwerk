#!/usr/bin/env python3
"""Loopback-Selbsttest fuer den KNXnet/IP-Simulator (M1 + M2).

Spielt einen minimalen Tunneling-Client durch und prueft zusaetzlich die
M2-Funktionen: Read-Beantwortung, Steuerkanal-Injektion, Regelwerk.
Exit 0 = ok, 1 = Fehler. Ohne echte KNX-Hardware, ohne EDOMI.
"""
import json
import socket
import struct
import sys
import threading
import time

from knxnet_sim import (
    KnxIpSimulator, _header, _hpai, ga_to_int, ga_to_str,
    DESCRIPTION_REQUEST, DESCRIPTION_RESPONSE,
    CONNECT_REQUEST, CONNECT_RESPONSE,
    CONNECTIONSTATE_REQUEST, CONNECTIONSTATE_RESPONSE,
    DISCONNECT_REQUEST, DISCONNECT_RESPONSE,
    TUNNELING_REQUEST, TUNNELING_ACK,
    CONN_TYPE_TUNNEL, L_DATA_REQ, L_DATA_IND,
)

HOST, PORT = "127.0.0.1", 13671
CTRL = PORT + 1
ANY_HPAI = _hpai("0.0.0.0", 0)


def recv(sock):
    data, _ = sock.recvfrom(1024)
    return struct.unpack("!H", data[2:4])[0], data[6:]


def parse_ind(body):
    """TUNNELING_REQUEST-Body -> (dst, kind, value) fuer L_Data.ind, sonst None."""
    cemi = body[4:]
    if not cemi or cemi[0] != L_DATA_IND:
        return None
    p = 2 + cemi[1]
    dst = struct.unpack("!H", cemi[p + 4: p + 6])[0]
    npdu_len = cemi[p + 6]
    pl = cemi[p + 7: p + 7 + npdu_len + 1]
    kind = ((pl[0] & 0x03) << 8 | pl[1]) & 0x3C0
    value = pl[1] & 0x3F if npdu_len == 1 else int.from_bytes(pl[2:], "big")
    return dst, kind, value


def collect_inds(sock, want: int, timeout=2.0):
    """Sammelt L_Data.ind-Frames (ignoriert ACK/CON) bis want erreicht/Timeout."""
    inds, deadline = [], time.monotonic() + timeout
    while len(inds) < want and time.monotonic() < deadline:
        try:
            sock.settimeout(max(0.05, deadline - time.monotonic()))
            svc, body = recv(sock)
        except socket.timeout:
            break
        if svc == TUNNELING_REQUEST:
            ind = parse_ind(body)
            if ind:
                inds.append(ind)
    return inds


def main() -> int:
    sim = KnxIpSimulator(HOST, PORT, ctrl_port=CTRL, log_path=None)
    threading.Thread(target=sim.serve, daemon=True).start()
    time.sleep(0.3)

    cli = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    cli.bind((HOST, 0))
    cli.settimeout(2.0)
    ctl = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    ctl.settimeout(2.0)
    dest = (HOST, PORT)
    ok = True

    def check(cond, label):
        nonlocal ok
        print(("PASS" if cond else "FAIL"), label)
        ok = ok and cond

    def ctrl(obj):
        ctl.sendto(json.dumps(obj).encode(), (HOST, CTRL))
        resp, _ = ctl.recvfrom(65535)
        return json.loads(resp)

    def tunnel_write(channel, seq, ga, value):
        cemi = struct.pack("!BBBBHHB", L_DATA_REQ, 0x00, 0xBC, 0xE0,
                           0x0000, ga_to_int(ga), 1) + bytes([0x00, 0x80 | value])
        cli.sendto(_header(TUNNELING_REQUEST,
                           struct.pack("!BBBB", 0x04, channel, seq, 0x00) + cemi), dest)

    # 0) DESCRIPTION — EDOMI macht das ZWINGEND vor CONNECT (Regression!)
    cli.sendto(_header(DESCRIPTION_REQUEST, ANY_HPAI), dest)
    svc, body = recv(cli)
    check(svc == DESCRIPTION_RESPONSE, "DESCRIPTION_RESPONSE erhalten")
    check(len(body) >= 54 and body[0] == 54 and body[1] == 0x01,
          "DEVICE_INFO-DIB (54 Byte, Typ 0x01)")
    fams = body[54:]
    check(len(fams) >= 2 and fams[1] == 0x02 and 0x04 in fams[2::2],
          "SUPP_SVC_FAMILIES mit Tunnelling (0x04)")

    # 1) CONNECT + Heartbeat
    cri = struct.pack("!BBBB", 0x04, CONN_TYPE_TUNNEL, 0x02, 0x00)
    cli.sendto(_header(CONNECT_REQUEST, ANY_HPAI + ANY_HPAI + cri), dest)
    svc, body = recv(cli)
    channel = body[0]
    check(svc == CONNECT_RESPONSE and body[1] == 0x00, "CONNECT_RESPONSE, Status 0")
    cli.sendto(_header(CONNECTIONSTATE_REQUEST,
                       struct.pack("!BB", channel, 0x00) + ANY_HPAI), dest)
    svc, body = recv(cli)
    check(svc == CONNECTIONSTATE_RESPONSE and body[1] == 0x00,
          "CONNECTIONSTATE_RESPONSE, Status 0")

    # 2) Write 1/2/3 = 1 (ACK + con kommen; werden hier nicht einzeln geprueft)
    tunnel_write(channel, 0, "1/2/3", 1)
    time.sleep(0.2)
    check(sim.ga_values.get(ga_to_int("1/2/3")) == 1, "Write gespeichert (1/2/3 = 1)")

    # 3) M2: GroupValueRead 1/2/3 -> GroupValueResponse mit Wert 1
    cemi = struct.pack("!BBBBHHB", L_DATA_REQ, 0x00, 0xBC, 0xE0,
                       0x0000, ga_to_int("1/2/3"), 1) + bytes([0x00, 0x00])
    cli.sendto(_header(TUNNELING_REQUEST,
                       struct.pack("!BBBB", 0x04, channel, 1, 0x00) + cemi), dest)
    inds = collect_inds(cli, want=1)
    check(any(d == ga_to_int("1/2/3") and k == 0x040 and v == 1 for d, k, v in inds),
          "Read wird mit Response 1/2/3 = 1 beantwortet")

    # 4) M2: Steuerkanal-Injektion
    r = ctrl({"cmd": "send", "ga": "4/4/4", "value": 5})
    check(r.get("ok") and r.get("tunnels") == 1, "Steuerkanal: send ok (1 Tunnel)")
    inds = collect_inds(cli, want=1)
    check(any(d == ga_to_int("4/4/4") and k == 0x080 and v == 5 for d, k, v in inds),
          "Injektion kommt als L_Data.ind write 4/4/4 = 5 an")

    # 5) M2: Regel on 5/5/5 -> echo auf 5/5/6 nach 50 ms
    r = ctrl({"cmd": "rule", "on": "5/5/5", "send": "5/5/6",
              "value": "echo", "delay_ms": 50})
    check(r.get("ok"), "Steuerkanal: Regel angelegt")
    tunnel_write(channel, 2, "5/5/5", 7)
    inds = collect_inds(cli, want=1, timeout=2.0)
    check(any(d == ga_to_int("5/5/6") and v == 7 for d, k, v in inds),
          "Regel feuert: 5/5/5 = 7 -> 5/5/6 = 7 (echo, verzoegert)")

    # 6) DISCONNECT
    cli.sendto(_header(DISCONNECT_REQUEST,
                       struct.pack("!BB", channel, 0x00) + ANY_HPAI), dest)
    svc, body = recv(cli)
    check(svc == DISCONNECT_RESPONSE and body[1] == 0x00, "DISCONNECT_RESPONSE, Status 0")

    print("\n" + ("ALLE TESTS BESTANDEN" if ok else "TESTS FEHLGESCHLAGEN"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
