# SPEC-008: Bus-Simulator (KNXnet/IP) — Dev, CI & Schatten-Betrieb

- **Status:** Teilweise umgesetzt (M1+M2, `tools/bus-simulator/`)
- **Clean-Room-Erklärung:** Eigenständige Fachwerk-Komponente. Implementiert die
  **öffentliche** KNXnet/IP-/cEMI-Spezifikation. Kein Fremdcode.

## Zweck

Ein konfigurierbarer KNXnet/IP-Endpunkt für drei Rollen:
1. **Dev/CI-Gegenstelle:** Ein KNXnet/IP-Tunneling-Client (Fachwerk selbst, oder ein
   anderes KNX-System zum Interoperabilitätstest) kann sich verbinden und Telegramme
   senden/empfangen — ohne echte KNX-Hardware.
2. **Deterministische Testumgebung (CI):** reproduzierbare Szenarien für Logik-
   Akzeptanztests (ADR-0005).
3. **Schatten-/Spiegelbetrieb:** an einen realen Bus andocken und dessen Verkehr in die
   Simulation spiegeln (fail-safe read-only), um ein Test-Gewerk aus Live-Daten aufzubauen.

## Betriebsmodi

### M1 — Server/Endpoint  ✅ implementiert
KNXnet/IP-Tunneling-Server: DESCRIPTION (mit DEVICE_INFO + SUPP_SVC_FAMILIES) → CONNECT →
CONNECTIONSTATE/Heartbeat → TUNNELING (ACK + `L_Data.con`) → DISCONNECT; interner
GA-Wertespeicher. Nimmt Client-Verbindungen an; per Loopback-Selbsttest und gegen einen
realen KNXnet/IP-Client verifiziert.

### M2 — Skriptbare Geräte-/Event-Emulation  ✅ implementiert
Beantwortet `GroupValueRead` aus dem Wertespeicher; Regelwerk „wenn GA X geschrieben →
sende GA Y (Wert/echo) nach N ms"; UDP-JSON-Steuerkanal (Injektion/Regeln/Dump/Events);
Ereignis-Log als JSONL mit Monotonic-Zeitstempeln.

### M3 — Schatten-/Spiegelmodus (Tap)  — offen
An einem realen KNXnet/IP-Interface mithören und Telegramme in den Simulator spiegeln.
**Fail-safe:** Standard read-only (nie auf den realen Bus zurückschreiben); Rückschreiben
nur explizit und pro GA freischaltbar (vgl. `protected`, Plan § 4.2).

### M4 — Record & Replay  — offen
Verkehr zeitgestempelt aufzeichnen und deterministisch wieder einspielen (CI-Repro,
„Gewerk aus Live-Daten"). Das Ereignis-JSONL (M2) ist die Basis.

## Technik-Kandidaten (bei Bedarf per ADR)

- Eigenimplementierung (Python-Tool, aktuell) — volle Kontrolle über M2/M4.
- Bestehende KNXnet/IP-Stacks (z. B. calimero, knxd) — für schnelle Server/Tap-Rollen.

## Offene Fragen

- F-1: Tunneling vs. Routing (Multicast) für M1/M3.
- F-2: Deployment-Ort (muss vom anzubindenden Client erreichbar sein; bei Routing
  Multicast-Grenzen beachten).
- F-3: Reale Gateway-Daten für M3 (welches Interface, read-only-Zugang).

## Akzeptanzkriterien

- M1: Ein Tunneling-Client erreicht mit laufendem Simulator den Betrieb (Selbsttest grün,
  in CI).
- M2: deklaratives Regelbeispiel (Licht-GA → Status-GA nach 1 s) reproduzierbar.
- M3: Telegramme eines realen Busses erscheinen im Simulator, ohne ungefragtes
  Zurückschreiben (fail-safe belegt).
