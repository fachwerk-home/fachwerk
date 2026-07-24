# ADR-0014: Vertrauensmodell für Community-Bausteine

- **Status:** AKZEPTIERT (Betreiber, 2026-07-20) — V-1 und V-2 umgesetzt;
  V-3 umgesetzt (24.07.2026): Pins in `bausteine/pins.yaml`, Abweichung =
  Startverweigerung, `fachwerk baustein pin` zum Beglaubigen. Die harte
  protected-Regel war bereits erfuellt — und zwar strenger als gefordert:
  die Registry lehnt JEDEN Schreibzugriff aus der Logik auf `protected` ab,
  nicht nur den von Bausteinen mit `netz`-Faehigkeit (Test haelt das fest).
  V-4 bleibt terminiert, nicht implementiert.
- **Datum:** 2026-07-19
- **Kontext-Auslöser:** Review des Telegram-Bausteins; Frage des Betreibers,
  wie mit Community-Bausteinen sicher umzugehen ist.

## Kontext

ADR-0008 hat entschieden: Service-Bausteine deklarieren Capabilities, I/O
läuft außerhalb der Graph-Auswertung. Die P4-5-Sandbox (Worker mit Zeitlimit)
schützt aber nur vor **Hängern** — ein Node-Worker ist KEINE Sicherheits-
grenze: Baustein-Code kann heute `fetch`, `node:fs`, `node:child_process`
usw. erreichen. Für selbstgeschriebene Bausteine ist das egal; für
**Community-Bausteine** (B-6 „Volle Regale") heißt es: fremder Code läuft im
Prozess, der das Haus steuert.

Zwei Positionen im Raum: harte Blackbox-/Sandbox-Isolation (Betreiber) vs.
„Overkill für v1" (Maintainer-Review). Beide haben recht — auf
unterschiedlichen Stufen. Ehrliche Ausgangslage: In einem Open-Source-Stack
kann Schadcode überall stecken (Dependency, PR, Baustein); Bausteine sind
aber der EINZIGE Kanal, über den *Endnutzer* routinemäßig fremden Code
installieren — deshalb verdient genau dieser Kanal ein explizites Modell.

## Entscheidung (Stufenmodell)

### V-1: Capability-Deklaration ist Pflicht (ab sofort)
`manifest.yaml` erhält `capabilities:` (v1-Katalog: `netz` mit
Host-Allowlist, `zustand`, `timer`). Ein Baustein ohne `netz`-Capability
bekommt keinerlei Netz-Zugriff. Editor/CLI/Registry zeigen Capabilities wie
App-Berechtigungen an — VOR der Nutzung.

### V-2: Durchsetzung v1 = „weiche Sandbox" über ctx-Dienste
I/O gibt es für Bausteine AUSSCHLIESSLICH über die Engine-API:
`ctx.netz.hole(url, optionen)` (erzwingt die Host-Allowlist aus dem
Manifest, Timeout, Größenlimit; Ergebnis kommt als Ereignis über die Queue —
ADR-0008 S-2 bleibt unangetastet). Flankierend: Der Sandbox-Worker nullt
`fetch`/`process`/dynamisches `import` im Baustein-Scope, und der
Registry-Check lehnt Baustein-Code mit `import`/`require`/`node:`-Bezügen
statisch ab. **Schutzziel v1: Unfälle und triviale Bosheit — ausdrücklich
KEIN Schutz gegen entschlossene Angreifer.** Diese Grenze wird in der Doku
ehrlich benannt.

### V-3: Vertrauen bei Installation, nicht zur Laufzeit
Das Gewerk pinnt je Baustein `version` + `sha256` (Dateien-Hash); Abweichung
= Startverweigerung. Herkunftsstufen: `eigen` (im Gewerk erstellt) ·
`community` (aus der künftigen Registry, Review-Badge) · `unverifiziert`
(Warnbanner). Harte Regel unabhängig von der Stufe: **Bausteine mit
`netz`-Capability dürfen niemals `protected`-Datenpunkte schreiben**
(Engine erzwingt; Netz + Schloss/Alarm in einer Hand ist das
Exfiltrations-/Angriffsmuster schlechthin).

### V-4: Harte Isolation ist Stufe 2 — Schnittstelle heute schon passend
WASM-Runtime oder separater Prozess mit Node-Permission-Model bleibt der
dokumentierte Fluchtweg (ADR-0003/0008). Weil Bausteine I/O nur über
ctx-Dienste sehen (V-2), ist der Unterbau austauschbar, ohne ein Baustein-
Manifest oder eine Zeile Baustein-Code zu ändern. Trigger für Stufe 2:
öffentliche Baustein-Registry geht live (Phase 6/7).

## Konsequenzen

- Der **Telegram-Baustein wird Pilot**: statt eigenem `fetch` nutzt er
  `ctx.netz.hole` (Allowlist `api.telegram.org`); Spur 1 liefert vorher den
  kleinen Schnitt „ctx.netz + Capability-Schema + Registry-Check".
- Aufwand v1 ist klein (ein ctx-Dienst, ein Schema-Feld, ein statischer
  Check) und kauft das Wichtigste: Sichtbarkeit („dieser Baustein will ins
  Netz zu X") und Unfallschutz.
- Die Blackbox-Idee des Betreibers ist damit nicht abgelehnt, sondern
  terminiert (V-4) — und der Weg dorthin verbaut nichts.

## Umsetzungsstand (2026-07-20)

**V-1 und V-2 sind umgesetzt und gemessen**, nicht nur behauptet:

- `capabilities` im Baustein-Manifest (Schema + Typ); `netz` mit exakter
  Host-Allowlist, `zustand`, `timer`. Ohne Block: Bestandsschutz, aber nie Netz.
  `fachwerk run` protokolliert beim Start, welcher Baustein wohin darf.
- `ctx.netz.hole(id, url, optionen)` als einziger Weg nach draussen. Die
  Allowlist-Prüfung liegt in der Engine, nicht im Baustein. Timeout 10 s,
  Größenlimit 256 KB, Umleitungen werden abgelehnt (sie könnten aus der
  Allowlist herausführen). Die Antwort kommt als eigene Kaskade mit Auslöser
  `netz` — die Graph-Auswertung bleibt synchron (ADR-0008 S-2 unangetastet).
- Statischer Check beim Laden lehnt `fetch(`, `import`/`require`, `node:`,
  `process`, `globalThis`, `eval`, `Function(` ab. Nachgemessen an einem
  bösartigen Baustein: alle drei Angriffswege (Datei lesen, `process.env`-Token
  stehlen, exfiltrieren) werden beim Laden abgewiesen.
- Laufzeit-Härtung im Worker sperrt zusätzlich `fetch`, `WebSocket`,
  `XMLHttpRequest`, `EventSource`. Nachgemessen: ein Baustein, der den
  statischen Check mit `const heimlich = fetch;` umgeht, scheitert zur Laufzeit
  mit klarer Meldung statt still zu exfiltrieren.
- **Telegram-Baustein als Pilot migriert**: kein eigenes `fetch` mehr, Ausgänge
  `gesendet`/`fehler` werden aus der Antwort-Kaskade gesetzt statt dem Versand
  um eine Auslösung nachzulaufen.

Nicht umgesetzt (bewusst): **V-3** (Hash-Pinning, Herkunftsstufen und die harte
Regel „`netz`-Baustein schreibt nie `protected`") und **V-4** (harte Isolation).
Die Regel aus V-3 ist billig nachzurüsten und der nächste sinnvolle Schritt.
