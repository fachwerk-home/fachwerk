#!/usr/bin/env python3
"""Fachwerk Bus-Simulator — KNXnet/IP Tunneling-Server (M1 + M2).

M1: Minimaler, korrekter KNXnet/IP-Server (DESCRIPTION/CONNECT/HEARTBEAT/
    TUNNELING/DISCONNECT), gegen den sich ein KNXnet/IP-Tunneling-Client
    verbinden kann.

M2: Skriptbare Geraete-/Event-Emulation und Fernsteuerung:
    - beantwortet GroupValueRead aus dem GA-Wertespeicher (InitScan!)
    - Regelwerk: "wenn GA X geschrieben wird -> sende GA Y (Wert/Echo) nach N ms"
    - Steuerkanal (UDP, JSON): Telegramme injizieren, Regeln setzen, Werte dumpen
    - Ereignis-Log als JSONL (Monotonic-Zeitstempel) fuer Messauswertungen

Referenz: oeffentliche KNXnet/IP-/cEMI-Rahmenformate. Kein Fremdcode.
Spezifikation: specs/SPEC-008-bus-simulator.md
"""
from __future__ import annotations
import argparse
import collections
import json
import logging
import selectors
import socket
import struct
import threading
import time

# --- KNXnet/IP-Konstanten -------------------------------------------------
HEADER_SIZE = 0x06
PROTO_VERSION = 0x10
HPAI_UDP = 0x01

SEARCH_REQUEST = 0x0201
SEARCH_RESPONSE = 0x0202
DESCRIPTION_REQUEST = 0x0203
DESCRIPTION_RESPONSE = 0x0204
CONNECT_REQUEST = 0x0205
CONNECT_RESPONSE = 0x0206
CONNECTIONSTATE_REQUEST = 0x0207
CONNECTIONSTATE_RESPONSE = 0x0208
DISCONNECT_REQUEST = 0x0209
DISCONNECT_RESPONSE = 0x020A
TUNNELING_REQUEST = 0x0420
TUNNELING_ACK = 0x0421

CONN_TYPE_TUNNEL = 0x04
E_NO_ERROR = 0x00
E_CONNECTION_ID = 0x21

# cEMI-Message-Codes
L_DATA_REQ = 0x11
L_DATA_CON = 0x2E
L_DATA_IND = 0x29

# APCI (10 Bit, obere 4 Bits relevant)
APCI_READ = 0x000
APCI_RESPONSE = 0x040
APCI_WRITE = 0x080

log = logging.getLogger("knxsim")


def _header(service: int, body: bytes) -> bytes:
    return struct.pack("!BBHH", HEADER_SIZE, PROTO_VERSION, service,
                       HEADER_SIZE + len(body)) + body


def _hpai(ip: str, port: int) -> bytes:
    return struct.pack("!BB4sH", 0x08, HPAI_UDP, socket.inet_aton(ip), port)


def _parse_hpai(data: bytes, off: int) -> tuple[str, int, int]:
    length = data[off]
    ip = socket.inet_ntoa(data[off + 2: off + 6])
    port = struct.unpack("!H", data[off + 6: off + 8])[0]
    return ip, port, off + length


def ga_to_int(ga) -> int:
    if isinstance(ga, int):
        return ga
    h, m, s = (int(x) for x in str(ga).split("/"))
    return (h << 11) | (m << 8) | s


def ga_to_str(ga: int) -> str:
    return f"{(ga >> 11) & 0x1F}/{(ga >> 8) & 0x07}/{ga & 0xFF}"


class Connection:
    __slots__ = ("channel", "data_ep", "ctrl_ep", "recv_seq", "send_seq", "last_seen")

    def __init__(self, channel: int, data_ep, ctrl_ep):
        self.channel = channel
        self.data_ep = data_ep
        self.ctrl_ep = ctrl_ep
        self.recv_seq = 0
        self.send_seq = 0
        self.last_seen = time.monotonic()


class KnxIpSimulator:
    def __init__(self, bind_ip: str, port: int, server_ia: int = 0x0FFF,
                 ctrl_port: int | None = None, log_path: str = "events.jsonl",
                 rules_path: str | None = None, answer_reads: bool = True):
        self.bind_ip = bind_ip
        self.port = port
        self.server_ia = server_ia
        self.assign_ia = 0x0AFF
        self.ctrl_port = ctrl_port if ctrl_port is not None else port + 1
        self.answer_reads = answer_reads
        self.sock: socket.socket | None = None
        self.ctrl_sock: socket.socket | None = None
        self.conns: dict[int, Connection] = {}
        self.next_channel = 1
        self.ga_values: dict[int, int | bytes] = {}
        self.rules: list[dict] = []
        self.lock = threading.RLock()
        self.events = collections.deque(maxlen=20000)   # In-Memory-Ringpuffer (Fernabruf)
        self._log_fh = open(log_path, "a", encoding="utf-8") if log_path else None
        if rules_path:
            with open(rules_path, encoding="utf-8") as fh:
                self.rules = json.load(fh)
            log.info("%d Regel(n) aus %s geladen", len(self.rules), rules_path)

    # -- Ereignis-Log --------------------------------------------------------
    def _log_event(self, **kw):
        kw.setdefault("t", time.time())
        kw.setdefault("mono", time.monotonic())
        self.events.append(kw)
        if self._log_fh:
            self._log_fh.write(json.dumps(kw, separators=(",", ":")) + "\n")
            self._log_fh.flush()

    # -- Lifecycle -----------------------------------------------------------
    def serve(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind((self.bind_ip, self.port))
        self.ctrl_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.ctrl_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.ctrl_sock.bind((self.bind_ip, self.ctrl_port))
        log.info("KNXnet/IP-Simulator laeuft auf %s:%d (Server-IA 0x%04X) | "
                 "Steuerkanal UDP %d", self.bind_ip, self.port, self.server_ia,
                 self.ctrl_port)
        sel = selectors.DefaultSelector()
        sel.register(self.sock, selectors.EVENT_READ, self._read_main)
        sel.register(self.ctrl_sock, selectors.EVENT_READ, self._read_ctrl)
        while True:
            for key, _ in sel.select():
                key.data()

    def _read_main(self):
        data, addr = self.sock.recvfrom(1024)
        try:
            self._dispatch(data, addr)
        except Exception:  # pragma: no cover
            log.exception("Fehler bei Verarbeitung von %s", addr)

    def _read_ctrl(self):
        data, addr = self.ctrl_sock.recvfrom(65535)
        try:
            self._on_ctrl(data, addr)
        except Exception as exc:  # pragma: no cover
            log.exception("Steuerkanal-Fehler von %s", addr)
            try:
                self.ctrl_sock.sendto(
                    json.dumps({"ok": False, "error": str(exc)}).encode(), addr)
            except OSError:
                pass

    # -- KNXnet/IP-Dispatch ----------------------------------------------------
    def _dispatch(self, data: bytes, addr):
        if len(data) < HEADER_SIZE or data[0] != HEADER_SIZE or data[1] != PROTO_VERSION:
            return
        service = struct.unpack("!H", data[2:4])[0]
        body = data[HEADER_SIZE:]
        handler = {
            SEARCH_REQUEST: self._on_search,
            DESCRIPTION_REQUEST: self._on_description,
            CONNECT_REQUEST: self._on_connect,
            CONNECTIONSTATE_REQUEST: self._on_connectionstate,
            DISCONNECT_REQUEST: self._on_disconnect,
            TUNNELING_REQUEST: self._on_tunneling,
            TUNNELING_ACK: self._on_tunneling_ack,
        }.get(service)
        if handler is None:
            log.debug("unbehandelter Service 0x%04X von %s", service, addr)
            return
        log.debug("<- 0x%04X von %s", service, addr)
        handler(body, addr)

    def _send(self, service: int, body: bytes, dest):
        with self.lock:
            self.sock.sendto(_header(service, body), dest)
        log.debug("-> 0x%04X an %s", service, dest)

    # -- DIBs -------------------------------------------------------------------
    def _dib_device_info(self) -> bytes:
        name = b"Fachwerk-Sim".ljust(30, b"\x00")[:30]
        return struct.pack(
            "!BBBBHH6s4s6s30s",
            54, 0x01,
            0x02,                                 # KNX-Medium TP1
            0x00,                                 # Device Status
            self.server_ia,
            0x0000,
            b"\x00\x00\x00\x00\x00\x00",
            socket.inet_aton("224.0.23.12"),
            b"\x00\x00\x00\x00\x00\x00",
            name,
        )

    def _dib_supp_families(self) -> bytes:
        fams = bytes([0x02, 0x01, 0x03, 0x01, 0x04, 0x01])
        return struct.pack("!BB", 2 + len(fams), 0x02) + fams

    def _description_block(self) -> bytes:
        return self._dib_device_info() + self._dib_supp_families()

    # -- Handler ------------------------------------------------------------------
    def _on_search(self, body, addr):
        ip, port, _ = _parse_hpai(body, 0)
        dest = (ip if ip != "0.0.0.0" else addr[0], port if port else addr[1])
        self._send(SEARCH_RESPONSE,
                   _hpai(self.bind_ip, self.port) + self._description_block(), dest)

    def _on_description(self, body, addr):
        self._send(DESCRIPTION_RESPONSE, self._description_block(), addr)

    def _on_connect(self, body, addr):
        ctrl_ip, ctrl_port, off = _parse_hpai(body, 0)
        data_ip, data_port, off = _parse_hpai(body, off)
        channel = self.next_channel
        self.next_channel = (self.next_channel % 254) + 1
        ctrl_ep = (ctrl_ip if ctrl_ip != "0.0.0.0" else addr[0],
                   ctrl_port if ctrl_port else addr[1])
        data_ep = (data_ip if data_ip != "0.0.0.0" else addr[0],
                   data_port if data_port else addr[1])
        with self.lock:
            self.conns[channel] = Connection(channel, data_ep, ctrl_ep)
        crd = struct.pack("!BBH", 0x04, CONN_TYPE_TUNNEL, self.assign_ia)
        resp = struct.pack("!BB", channel, E_NO_ERROR) + \
            _hpai(self.bind_ip, self.port) + crd
        self._send(CONNECT_RESPONSE, resp, ctrl_ep)
        log.info("Verbindung offen: Kanal %d, Data-Endpoint %s", channel, data_ep)
        self._log_event(ev="connect", channel=channel, peer=f"{data_ep[0]}:{data_ep[1]}")

    def _on_connectionstate(self, body, addr):
        channel = body[0]
        status = E_NO_ERROR if channel in self.conns else E_CONNECTION_ID
        if channel in self.conns:
            self.conns[channel].last_seen = time.monotonic()
        self._send(CONNECTIONSTATE_RESPONSE, struct.pack("!BB", channel, status), addr)

    def _on_disconnect(self, body, addr):
        channel = body[0]
        with self.lock:
            self.conns.pop(channel, None)
        self._send(DISCONNECT_RESPONSE, struct.pack("!BB", channel, E_NO_ERROR), addr)
        log.info("Verbindung geschlossen: Kanal %d", channel)
        self._log_event(ev="disconnect", channel=channel)

    def _on_tunneling_ack(self, body, addr):
        channel = body[1]
        conn = self.conns.get(channel)
        if conn:
            conn.last_seen = time.monotonic()

    def _on_tunneling(self, body, addr):
        _clen, channel, seq = body[0], body[1], body[2]
        cemi = body[4:]
        conn = self.conns.get(channel)
        if conn is None:
            return
        self._send(TUNNELING_ACK, struct.pack("!BBBB", 0x04, channel, seq, E_NO_ERROR), addr)
        conn.recv_seq = (seq + 1) & 0xFF
        conn.last_seen = time.monotonic()
        self._handle_cemi(conn, cemi)

    # -- cEMI ------------------------------------------------------------------------
    def _handle_cemi(self, conn: Connection, cemi: bytes):
        if not cemi or cemi[0] != L_DATA_REQ:
            return
        add_len = cemi[1]
        p = 2 + add_len
        src = struct.unpack("!H", cemi[p + 2: p + 4])[0]
        dst = struct.unpack("!H", cemi[p + 4: p + 6])[0]
        npdu_len = cemi[p + 6]
        pl = cemi[p + 7: p + 7 + npdu_len + 1]
        apci = ((pl[0] & 0x03) << 8) | pl[1] if len(pl) >= 2 else 0
        kind = apci & 0x3C0
        if kind == APCI_WRITE or kind == APCI_RESPONSE:
            value = pl[1] & 0x3F if npdu_len == 1 else int.from_bytes(pl[2:2 + npdu_len - 1], "big")
            with self.lock:
                self.ga_values[dst] = value
            log.info("RX write GA %s = %s (%d Byte)", ga_to_str(dst), value, npdu_len)
            self._log_event(ev="rx", type="write", ga=ga_to_str(dst), value=value,
                            src=f"{src:04x}", npdu_len=npdu_len)
        elif kind == APCI_READ:
            log.info("RX read  GA %s", ga_to_str(dst))
            self._log_event(ev="rx", type="read", ga=ga_to_str(dst), src=f"{src:04x}")
        # L_Data.con-Bestaetigung an den Client
        self._send_tunnel(conn, bytes([L_DATA_CON]) + cemi[1:])
        # M2: Read beantworten / Regeln anwenden
        if kind == APCI_READ and self.answer_reads and dst in self.ga_values:
            self.inject(dst, self.ga_values[dst], apci=APCI_RESPONSE)
        if kind == APCI_WRITE:
            self._apply_rules(dst, self.ga_values.get(dst))

    def _send_tunnel(self, conn: Connection, cemi: bytes):
        with self.lock:
            hdr = struct.pack("!BBBB", 0x04, conn.channel, conn.send_seq, 0x00)
            conn.send_seq = (conn.send_seq + 1) & 0xFF
            self._send(TUNNELING_REQUEST, hdr + cemi, conn.data_ep)

    # -- M2: Injektion & Regeln ----------------------------------------------------------
    def inject(self, ga, value, size: int | None = None, apci: int = APCI_WRITE):
        """Sendet ein L_Data.ind (Write/Response) an alle verbundenen Tunnel."""
        dst = ga_to_int(ga)
        value = int(value)
        if (size is None or size == 0) and 0 <= value <= 63:
            pl = bytes([0x00, (APCI_WRITE if apci == APCI_WRITE else APCI_RESPONSE) | value])
            npdu_len = 1
        else:
            nbytes = size or max(1, (value.bit_length() + 7) // 8)
            pl = bytes([0x00, 0x80 if apci == APCI_WRITE else 0x40]) + \
                value.to_bytes(nbytes, "big")
            npdu_len = 1 + nbytes
        cemi = struct.pack("!BBBBHHB", L_DATA_IND, 0x00, 0xBC, 0xE0,
                           self.server_ia, dst, npdu_len) + pl
        with self.lock:
            self.ga_values[dst] = value
            conns = list(self.conns.values())
        for conn in conns:
            self._send_tunnel(conn, cemi)
        typ = "write" if apci == APCI_WRITE else "response"
        log.info("TX %s GA %s = %s -> %d Tunnel", typ, ga_to_str(dst), value, len(conns))
        self._log_event(ev="tx", type=typ, ga=ga_to_str(dst), value=value,
                        tunnels=len(conns))
        return len(conns)

    def _apply_rules(self, dst: int, value):
        for rule in self.rules:
            if ga_to_int(rule["on"]) != dst:
                continue
            out_val = value if rule.get("value") == "echo" else rule.get("value", value)
            delay = rule.get("delay_ms", 0) / 1000.0
            size = rule.get("size")
            target = rule["send"]
            log.info("Regel: GA %s -> sende %s = %s in %d ms",
                     ga_to_str(dst), target, out_val, int(delay * 1000))
            if delay > 0:
                threading.Timer(delay, self.inject, args=(target, out_val, size)).start()
            else:
                self.inject(target, out_val, size)

    # -- Steuerkanal (UDP-JSON) --------------------------------------------------------
    def _on_ctrl(self, data: bytes, addr):
        cmd = json.loads(data.decode("utf-8"))
        op = cmd.get("cmd")
        resp: dict = {"ok": True, "cmd": op}
        if op == "ping":
            resp["conns"] = len(self.conns)
        elif op == "send":
            resp["tunnels"] = self.inject(cmd["ga"], cmd["value"], cmd.get("size"))
        elif op == "response":
            resp["tunnels"] = self.inject(cmd["ga"], cmd["value"], cmd.get("size"),
                                          apci=APCI_RESPONSE)
        elif op == "burst":
            gap = cmd.get("gap_ms", 0) / 1000.0
            for item in cmd["items"]:
                self.inject(item["ga"], item["value"], item.get("size"))
                if gap:
                    time.sleep(gap)
            resp["count"] = len(cmd["items"])
        elif op == "set":
            with self.lock:
                self.ga_values[ga_to_int(cmd["ga"])] = int(cmd["value"])
        elif op == "rule":
            self.rules.append({k: cmd[k] for k in
                               ("on", "send", "value", "delay_ms", "size") if k in cmd})
            resp["rules"] = len(self.rules)
        elif op == "rules":
            resp["rules"] = self.rules
        elif op == "clear_rules":
            self.rules.clear()
        elif op == "dump":
            resp["values"] = {ga_to_str(k): (v if isinstance(v, int) else v.hex())
                              for k, v in self.ga_values.items()}
            resp["conns"] = len(self.conns)
        elif op == "events":
            n = int(cmd.get("n", 100))
            resp["events"] = list(self.events)[-n:]
        elif op == "events_clear":
            self.events.clear()
        else:
            resp = {"ok": False, "error": f"unbekanntes Kommando: {op}"}
        self.ctrl_sock.sendto(json.dumps(resp).encode("utf-8"), addr)
        self._log_event(ev="ctrl", cmd=op, peer=f"{addr[0]}:{addr[1]}")


def main():
    ap = argparse.ArgumentParser(description="Fachwerk KNXnet/IP Bus-Simulator (M1+M2)")
    ap.add_argument("--bind", default="0.0.0.0", help="Bind-IP (Default 0.0.0.0)")
    ap.add_argument("--port", type=int, default=3671, help="UDP-Port (Default 3671)")
    ap.add_argument("--ctrl-port", type=int, default=None,
                    help="Steuerkanal-UDP-Port (Default: Port+1)")
    ap.add_argument("--log", default="events.jsonl",
                    help="Ereignis-Log (JSONL); leer = deaktiviert")
    ap.add_argument("--rules", default=None, help="Regeldatei (JSON-Liste)")
    ap.add_argument("--no-read-response", action="store_true",
                    help="GroupValueRead NICHT aus dem Wertespeicher beantworten")
    ap.add_argument("-v", "--verbose", action="store_true", help="Debug-Log")
    args = ap.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    KnxIpSimulator(args.bind, args.port, ctrl_port=args.ctrl_port,
                   log_path=args.log or None, rules_path=args.rules,
                   answer_reads=not args.no_read_response).serve()


if __name__ == "__main__":
    main()
