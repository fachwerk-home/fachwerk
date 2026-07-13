# Fachwerk Bus-Simulator (KNXnet/IP)

Konfigurierbarer KNXnet/IP-Endpunkt für Dev/CI und späteren Schatten-/Spiegelbetrieb.
Spezifikation & Roadmap: [../../specs/SPEC-008-bus-simulator.md](../../specs/SPEC-008-bus-simulator.md).
Implementiert die **öffentliche** KNXnet/IP-/cEMI-Spezifikation; kein Fremdcode.

## Status

- **M1 — Tunneling-Server:** ✅ implementiert, per Loopback-Selbsttest verifiziert und
  gegen einen realen KNXnet/IP-Client validiert. Handshake: DESCRIPTION / CONNECT /
  CONNECTIONSTATE / DISCONNECT / TUNNELING (ACK + `L_Data.con`), interner GA-Wertespeicher.
  Hinweis: KNXnet/IP-Clients verlangen typischerweise einen korrekt beantworteten
  DESCRIPTION_REQUEST **vor** CONNECT (DEVICE_INFO + SUPP_SVC_FAMILIES).
- **M2 — skriptbare Geräte-/Event-Emulation:** ✅ implementiert. Beantwortet
  `GroupValueRead` aus dem Wertespeicher; Regelwerk „wenn GA X geschrieben → sende GA Y
  (fester Wert oder `echo`) nach N ms"; UDP-JSON-Steuerkanal (Default Port 3672) für
  Injektion/Regeln/Dump/Events; Ereignis-Log als JSONL (Monotonic-Zeitstempel).
- **M3 — Schatten-/Spiegelmodus:** offen. **M4 — Record/Replay:** offen (JSONL ist die Basis).

Nur Python-Standardbibliothek, keine Abhängigkeiten.

## Lokal starten

```bash
python knxnet_sim.py --bind <host-ip> --port 3671 -v
```

## Selbsttest (ohne KNX-Hardware, ohne Client)

```bash
python selftest.py        # Exit 0 = ok; läuft auch in CI
```

## Als Container

```bash
docker build -t fachwerk-bussim .
docker run -d --name bussim --network host --restart unless-stopped \
  fachwerk-bussim --bind <host-ip> --port 3671 -v
```

KNXnet/IP ist NAT-empfindlich → `--network host` (kein Docker-UDP-NAT). `<host-ip>` = LAN-IP
des Docker-Hosts, damit der Server im Handshake den korrekten Endpunkt annonciert.

## Fernsteuerung (`simctl.py`)

```bash
python simctl.py <sim-host> ping
python simctl.py <sim-host> send 9/1/0 1                     # GroupValueWrite injizieren
python simctl.py <sim-host> send 9/1/0 1 --repeat 50 --gap-ms 20   # Telegramm-Sturm
python simctl.py <sim-host> rule 9/3/1 9/3/2 --value echo --delay-ms 100
python simctl.py <sim-host> dump                             # GA-Wertespeicher + Verbindungen
python simctl.py <sim-host> events -n 50                     # letzte Ereignisse (Fernabruf)
python simctl.py <sim-host> events_clear                     # Ereignispuffer leeren
```

Der In-Memory-Ereignispuffer (`events`) erlaubt das ferngesteuerte Auslesen von
Reihenfolge/Zeitpunkten über den Steuerkanal. Messablauf: `events_clear` → `send …` → `events`.
Jede Zeile im `events.jsonl` enthält `mono` (Monotonic-Sekunden) für Reihenfolge/Latenz.
