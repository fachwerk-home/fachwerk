#!/usr/bin/env python3
"""simctl — Fernsteuerung fuer den laufenden Bus-Simulator (Steuerkanal, UDP-JSON).

Beispiele:
    python simctl.py <sim-host> ping
    python simctl.py <sim-host> send 9/1/0 1
    python simctl.py <sim-host> send 9/1/0 1 --repeat 2 --gap-ms 0
    python simctl.py <sim-host> rule 9/3/1 9/3/2 --value echo --delay-ms 100
    python simctl.py <sim-host> dump
Exit 0 bei ok:true, sonst 1.
"""
import argparse
import json
import socket
import sys
import time


def call(host: str, port: int, obj: dict) -> dict:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(3.0)
    s.sendto(json.dumps(obj).encode("utf-8"), (host, port))
    data, _ = s.recvfrom(65535)
    return json.loads(data)


def main() -> int:
    ap = argparse.ArgumentParser(description="Steuerkanal-Client fuer den Bus-Simulator")
    ap.add_argument("host")
    ap.add_argument("cmd", choices=["ping", "send", "response", "set", "rule",
                                    "rules", "clear_rules", "dump", "events",
                                    "events_clear"])
    ap.add_argument("args", nargs="*", help="send/set: GA WERT · rule: ON-GA SEND-GA")
    ap.add_argument("--ctrl-port", type=int, default=3672)
    ap.add_argument("-n", type=int, default=100, help="events: Anzahl der letzten Ereignisse")
    ap.add_argument("--size", type=int, default=None, help="Nutzdaten-Bytes (0=6-Bit)")
    ap.add_argument("--value", default=None, help="rule: fester Wert oder 'echo'")
    ap.add_argument("--delay-ms", type=int, default=0, help="rule: Verzoegerung")
    ap.add_argument("--repeat", type=int, default=1, help="send: N-mal senden")
    ap.add_argument("--gap-ms", type=int, default=0, help="send: Pause zwischen Sends")
    a = ap.parse_args()

    if a.cmd in ("send", "response", "set"):
        obj = {"cmd": a.cmd, "ga": a.args[0], "value": int(a.args[1])}
        if a.size is not None:
            obj["size"] = a.size
    elif a.cmd == "rule":
        val = a.value if a.value in (None, "echo") else int(a.value)
        obj = {"cmd": "rule", "on": a.args[0], "send": a.args[1],
               "value": val if val is not None else "echo", "delay_ms": a.delay_ms}
        if a.size is not None:
            obj["size"] = a.size
    elif a.cmd == "events":
        obj = {"cmd": "events", "n": a.n}
    else:
        obj = {"cmd": a.cmd}

    rc = 0
    for i in range(a.repeat):
        resp = call(a.host, a.ctrl_port, obj)
        if a.cmd == "events" and resp.get("ok"):
            for ev in resp.get("events", []):
                print(json.dumps(ev, ensure_ascii=False))
        else:
            print(json.dumps(resp, ensure_ascii=False))
        rc = 0 if resp.get("ok") else 1
        if a.gap_ms and i < a.repeat - 1:
            time.sleep(a.gap_ms / 1000.0)
    return rc


if __name__ == "__main__":
    sys.exit(main())
