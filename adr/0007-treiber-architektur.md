# ADR-0007: Treiber-Architektur

- **Status:** Akzeptiert (2026-07-10)
- **Datum:** 2026-07-10
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)

## Kontext

Treiber verbinden Datenpunkte mit der Außenwelt (KNX, MQTT, Bridges zu FHEM/HA …).
Anforderungen aus Zielspezifikation und Plan:
- **SPEC-007 A-1 (Grundsatz):** Fachwerks Core startet **treiber-unabhängig**; Treiber
  verbinden asynchron, Reconnect mit Backoff, Status statt Blockade — ein nicht erreichbares
  Gateway darf den Systemstart nie blockieren.
- **ADR-0003:** Treiber sind die erste sprachneutrale Naht (später Rust/Go-Treiber möglich).
- **FHEM-Lehre (Plan § 1.2):** niedrigschwellige Treiber-API = Wachstumsbedingung des
  Ökosystems.
- **Isolation (Plan § 4.2):** ein hängender Treiber darf nie die Engine bremsen
  (FHEM-Monolith-Lehre).

## Entscheidung

### T-1: Treiber-Vertrag = schmales, sprachneutrales Nachrichtenprotokoll
Ein Treiber ist ein Prozess (oder In-Process-Modul, s. T-2), der mit dem Core über
**JSON-Lines-Nachrichten** spricht:
- `hello` (Fähigkeiten, Version) · `configure` (aus `gewerk/drivers/*.yaml`)
- `subscribe`/`publish` von **Datenpunkt-Ereignissen** (Wert, Zeitstempel, Quelle)
- `status` (connected/disconnected/degraded + Details) · `health`-Ping
- strukturierte Fehler; keine stillen Ausfälle
Der Vertrag wird als JSON-Schema versioniert (semver) — Testbarkeit: jeder Treiber ist
gegen einen Protokoll-Testkit prüfbar, ohne Core.

### T-2: Zwei Ausführungsformen, EIN Vertrag
- **In-Process (TS):** Standard für unsere eigenen Treiber — geringste Latenz/Reibung.
  Aber: nur über den Vertrag angebunden, kein Durchgriff auf Engine-Interna.
- **Out-of-Process:** identischer Vertrag über stdio/Unix-Socket/TCP — für Fremdsprachen
  (Rust/Go/Python), für instabile Treiber (Isolation) und für Remote-Treiber (Edge-Knoten).
Der Core behandelt beide gleich; ein Treiber kann ohne Core-Änderung zwischen beiden
Formen wechseln.

### T-3: Lebenszyklus & Resilienz (aus SPEC-007 A-1)
Core startet **immer** durch. Treiber: asynchroner Connect, exponentieller
Reconnect-Backoff, Status als Datenpunkte sichtbar (System-Datenpunkte je Treiber:
`driver.knx.status` …) → Logik/Visu können darauf reagieren. Watchdog: hängende
Out-of-Process-Treiber werden neu gestartet (supervised), In-Process-Treiber haben
Timeout-Budgets.

### T-4: Treiber-Stufenpolitik (Core vs. installierbar vs. Brücke)
Grundregel: **Core enthält nur, was identitätsstiftend oder universeller Interop-Hub ist.**
Alles Geräte-/Herstellerspezifische ist ein installierbares Paket. Kein Design nach dem
Setup einzelner Nutzer (weder des Betreibers noch der Entwickler).

- **Stufe 1 — Core (fest, vom Projekt gepflegt): genau KNX + MQTT.**
  - KNX: Identität (★★★ First-Class-Citizen). KNXnet/IP-Tunneling-Client; Protokollarbeit
    durch den Bus-Simulator vorgeleistet (SPEC-007), Simulator = CI-Gegenstelle.
  - MQTT: der herstellerneutrale Interop-Hub des DIY-Smarthomes (Zigbee2MQTT, Node-RED,
    FHEM, HA, ioBroker, Tasmota …) — maximale Reichweite pro Wartungsaufwand. Zugleich
    Community-Anforderung (★★, „nativ statt LBS-Nachrüstung").
  - Jeder weitere Core-Treiber ist ein **dauerhaftes Wartungsversprechen** → bewusst hohe
    Hürde (eigene ADR nötig).
- **Stufe 2 — Installierbare Treiber (SDK + Registry):** Hue, Sonos (lokale UPnP/HTTP-API),
  Modbus, EnOcean (serielles ESP3-Gateway), 1-Wire, … Kuratierter kleiner „offizieller"
  Satz + Community-Treiber (T-5-SDK). Auswahl folgt Nachfrage, nicht Vorlieben. Hue (lokale
  Bridge-HTTP-API) ist Kandidat für den SDK-Beispieltreiber. Merke: Die Stufenpolitik
  verbietet native Treiber **nicht** — sie hält sie nur aus dem Core heraus; alles mit
  IP-/Seriell-API ist als Stufe-2-Paket machbar.
- **Stufe 3 — Brücken statt Nachbau (Plan § 1.2):** Reife Ökosysteme integrieren statt
  reimplementieren. Direktes Zigbee z. B. NICHT nachbauen (Funk-Hardware, Firmware-Zoo,
  Geräte-DB) — Zigbee2MQTT hat das gelöst und spricht MQTT. FHEM-/HA-Bestände über deren
  MQTT-Wege anbinden; native Bridge-Treiber nur bei realem Bedarf als Stufe-2-Paket.

FHEMs „alles nativ im Monolith" und HAs „alles nativ mit Riesen-Community" sind beide
nicht unser Weg: **schlanker Core, mächtiges SDK.**

### T-5: Treiber-SDK-Versprechen (FHEM-Lehre)
Ein Community-Treiber in **einer Datei** mit dem SDK muss möglich sein: SDK kapselt
Protokoll-Handling, Entwickler implementiert im Kern `onConfigure/onSubscribe/onEvent`.
Doku mit Beispieltreiber (z. B. HTTP-Poll) gehört zum SDK-Release.

## Konsequenzen

- Sprachneutrale Naht ab Tag 1; Bus-Simulator wird zum Referenz-Testkit für den
  KNX-Treiber; Treiber-Crashs bleiben lokal.
- Kosten: Protokoll-/SDK-Pflege, zweite Ausführungsform testen.
- Offen: Transport-Detail Out-of-Process (stdio vs. Socket, Auth bei Remote),
  Versionierungs-/Kompatibilitätspolitik des Vertrags, Discovery (KNX-Gateway-Suche).
