# SPEC-007: KNX-Anbindung

- **Status:** Entwurf (Zielspezifikation)
- **Bezug:** ADR-0007 (Treiber-Architektur), SPEC-008 (Bus-Simulator als CI-Gegenstelle)

## Zweck & Geltungsbereich

Der KNX-Treiber verbindet Fachwerk-Datenpunkte mit einem KNX-System über **KNXnet/IP**
(offener Standard). KNX ist First-Class-Citizen (Core-Treiber, ADR-0007 Stufe 1).

## Anforderungen

- **A-1 Treiber-unabhängiger Start (nicht verhandelbar):** Der Fachwerk-Core startet
  **immer** durch, auch wenn kein KNX-Gateway erreichbar ist. Der Treiber verbindet
  **asynchron** mit exponentiellem Reconnect-Backoff; sein Zustand ist ein
  System-Datenpunkt (`driver.knx.status`), auf den Logik/Visu reagieren können. **Niemals**
  blockiert eine fehlende Verbindung den Systemstart.
- **A-2 KNXnet/IP-Tunneling-Client:** vollständiger Verbindungsaufbau nach Standard
  (DESCRIPTION → CONNECT → CONNECTIONSTATE/Heartbeat → TUNNELING → DISCONNECT). Der
  Handshake ist gegen den Bus-Simulator (SPEC-008) in CI getestet.
- **A-3 DPT-Kodierung:** Kern-DPTs kodieren/dekodieren; Werte gegen den Datenpunkt-Typ
  validiert (SPEC-001).
- **A-4 Busmonitor & Diagnose:** strukturierter Telegramm-Mitschnitt (agentenlesbar).
- **A-5 Reconnect im Betrieb:** Gateway-Ausfall/-Wiederkehr wird sauber behandelt.

## Offene Punkte

- Tunneling vs. Routing (Multicast) — Konfigurationsoption; Tunneling zuerst.
- Discovery (Gateway-Suche im LAN).
- KNX IP Secure / Data Secure, wo Hardware es hergibt (Plan § 4.2).

## Akzeptanzkriterien

- Core erreicht Betrieb ohne erreichbares Gateway (Treiber meldet disconnected, Backoff
  greift) — headless in CI gegen den Simulator geprüft.
