# ADR-0008: Baustein-Modell & Sandbox

- **Status:** Akzeptiert (2026-07-10)
- **Datum:** 2026-07-10
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)

## Kontext

Community-Bausteine sind der ★★★-USP des LBS-Konzepts — und zugleich das größte Risiko:
In EDOMI (und FHEM) läuft Fremdcode **ungeschützt im Engine-Prozess**: ein fehlerhafter
Baustein kann hängen, crashen, beliebig aufs System zugreifen; Ressourcenlimits gibt es
nicht. Fachwerk-Vorgaben: Isolation (Plan § 4.2), `protected`-Datenpunkte nie durch
Bausteine umgehbar, WASM-Naht aus ADR-0003, Bausteine sind Graph-Knoten der Engine
(ADR-0005) und müssen in Simulation/CI **deterministisch** laufen.

### Würdigung des EDOMI/FHEM-Modells (warum es damals rational war)

In-process ohne Sandbox bot: null Aufruf-Overhead (relevant auf 2010er-Hardware), radikale
Implementierungs-Einfachheit (Ein-Personen-Projekte!), volle Macht für Baustein-Autoren
ohne vorherige API-Entwürfe (der Ökosystem-Turbo beider Plattformen) — und es gab schlicht
keine praxistauglichen Embedded-Sandboxes für PHP/Perl. Der Preis (Stabilität, Sicherheit,
kein Determinismus) ist bekannt (u. a. blockierende Module in Monolith-Engines). Heute existieren
V8-Isolates/Worker/WASM; zudem behält S-4 den schnellen Pfad: Die kuratierte
Standardbibliothek läuft in-process — nur ungeprüfter Fremdcode zahlt die Worker-Kosten,
bei Gebäudeautomations-Ereignisraten vernachlässigbar. Die „volle Macht" wird nicht
verboten, sondern als deklarierte Capability sichtbar gemacht (S-5).

**Warum TS/JS+WASM statt PHP als natives Baustein-Format:** PHP ist in einen TS-Core nicht
einbettbar (CGI/CLI-Design → jede Auswertung wäre eine Prozessgrenze), kaum sandboxbar
(`disable_functions`-Blacklisting), und Determinismus-Injektion (S-3) ist praktisch
unmöglich; TS teilt Typen/Schema mit Engine und Agenten (ADR-0003). PHP bleibt
Kompatibilitäts-/Migrationspfad (Plan § 3.4, Phase 6, eigener Prozess); kleine
Ein-Datei-LBS sind zudem realistische Kandidaten für agentengestützte PHP→TS-Portierung.

## Entscheidung

### S-1: Baustein = Manifest + Code (Gewerk-Formatkonform)
Jeder Baustein besteht aus einem **deklarativen Manifest** (YAML: Schlüssel, Version
semver, Eingänge/Ausgänge mit Typen + Trigger-Defaults, Parameter-Schema, benötigte
**Capabilities**) und dem Code. Manifest ist maschinenlesbar → Editor-Palette,
Validierung, Linter, Registry und Agenten arbeiten mit derselben Beschreibung.

### S-2: Zwei Baustein-Klassen mit unterschiedlicher Semantik
- **Rechen-Bausteine (sync, pur):** `evaluate(inputs, state, ctx) → outputs/state`.
  Kurz laufend, keine I/O. Das ist der Normalfall (Gatter, Mathe, Filter, Timer-Logik).
- **Service-Bausteine (async I/O):** deklarieren Capabilities (z. B. `http`, `shell`);
  I/O läuft **außerhalb** der Graph-Auswertung; Ergebnisse kommen als **neue Ereignisse
  über die Queue** zurück (ADR-0005 E-3 bleibt unangetastet — nichts blockiert je eine
  Kaskade). EDOMIs Vermischung von Rechnen und I/O im selben EXEC-Modell wird damit
  strukturell aufgelöst.

### S-3: Determinismus-Regeln (Simulation/CI/Replay)
Bausteine erhalten Zeit, Zufall und Timer **ausschließlich über die Engine-API** (`ctx.now`,
`ctx.random`, `ctx.schedule`) — nie direkt (kein `Date.now()`). In Simulation/CI sind diese
Quellen gestellt/seedbar → Logik-Akzeptanztests und Replay (SPEC-008 M4) werden exakt
reproduzierbar. Verstöße erkennt der Registry-Check statisch.

### S-4: Drei Vertrauensstufen der Ausführung (analog Treiber-Tiering T-4)
1. **Standardbibliothek (Core, TS):** kuratierte, reviewte Bausteine — laufen in-process
   (schnellster Pfad), gebunden an dieselbe Baustein-API.
2. **Community-/Eigen-Bausteine (TS/JS):** laufen **isoliert** (Worker mit CPU-Zeitbudget
   pro Auswertung, Speicherlimit, ohne ambienten Zugriff auf FS/Netz/Prozess). Ein
   hängender Baustein wird abgebrochen und als Fehler getraced — nie hängt die Engine.
3. **WASM-Bausteine:** gleiches Manifest, Code als WASM-Modul (Rust, AssemblyScript, …) —
   die ADR-0003-Naht. Sandbox inhärent; gleiche Capability-Regeln.
   (PHP-LBS-Kompatibilitätslaufzeit aus Plan § 3.4 bleibt Phase-6-Thema: eigener Prozess,
   selbe Schnittstelle nach außen.)

### S-5: Capability-Modell statt Vollzugriff
Default: ein Baustein sieht **nur seine Ein-/Ausgänge, Parameter und `ctx`**. Alles Weitere
(HTTP, Dateisystem, Shell, breitere Datenpunkt-Zugriffe) ist eine **deklarierte Capability**
im Manifest, die bei Installation im Gewerk sichtbar bestätigt wird (à la App-Berechtigung).
`protected`-Datenpunkte (Plan § 4.2): für Baustein-Schreibzugriffe genau wie für Agenten
gesperrt — Verdrahtung auf protected-Ausgänge erfordert Admin-Bestätigung im Gewerk.

### S-6: Verteilung & Registry
Bausteine sind versionierte Pakete (Manifest+Code, signierbar — Plan Phase 4/7). Die
Registry prüft statisch: Manifest-Schema, Determinismus-Verstöße, Capability-Deklaration.
Ein-Datei-Einfachheit wie beim Treiber-SDK (FHEM-Lehre): simpler Rechen-Baustein =
eine Manifest-Datei + eine Codedatei, lokal testbar (`fachwerk block test`).

### S-7: Adoptions-Zusagen (Antwort auf das Autoren-Risiko)
Das Sprachrisiko konzentriert sich auf die kleine Autoren-Kohorte (die Nutzermasse
konsumiert Bausteine). Damit der Wechsel PHP→TS/JS kein Adoptions-Killer wird, sind
folgende Punkte **verbindlicher Teil dieser ADR**:
1. **Null-Toolchain-Regel:** Ein Baustein entsteht und läuft **ohne** lokale
   Node/npm/tsc-Installation — im eingebauten Baustein-Editor (Browser) mit Live-Test,
   oder als eine JS-Datei + Manifest via `fachwerk block new/test`. Die
   Ein-Datei-Einfachheit von EDOMI-LBS ist Messlatte, nicht Nostalgie.
2. **Plain JS genügt:** TS-Typen sind Angebot (bessere Tooling-/Agenten-Unterstützung),
   keine Pflicht.
3. **Agent-Autorenfluss als Feature:** „Beschreibe den Baustein → Agent schreibt
   Manifest+Code → `block test` beweist ihn" ist ein dokumentierter, unterstützter Weg —
   die 2026er-Antwort auf die 2010er-PHP-Einfachheit; ebenso agentengestützte
   PHP-LBS→TS-Portierung.
4. **Kompatibilität bleibt Umstiegspfad:** Die PHP-Kompat-Laufzeit (Plan § 3.4, Phase 6)
   macht native TS-Bausteine zur Zukunftsoption, nicht zur Eintrittskarte.
5. **Volle Regale zum Start:** Vor dem Community-Launch existiert ein natives
   Kern-Sortiment (Standardbibliothek + portierte Top-Community-Bausteine nach Bedarf der
   Referenzanlage und des Community-Katalogs) — kein leerer Baustein-Store.
Kontext 2026: Die Smarthome-Skript-Szene schreibt heute überwiegend JS (Node-RED,
ioBroker); PHP ist EDOMI-spezifische Nische — der Wechsel führt zur Verkehrssprache hin,
nicht von ihr weg.

## Konsequenzen

- Engine bleibt stabil, egal was die Community schreibt (Kern-Schwäche von EDOMI/FHEM
  behoben); Fehler werden zu Trace-Einträgen statt zu Systemhängern.
- Deterministische Bausteine machen Logik-CI und Replay erst möglich (SPEC-008).
- Agenten können Bausteine schreiben UND verifizieren (Manifest = maschinenlesbar,
  `block test` = headless).
- Kosten: Worker-Isolation + Budget-Enforcement bauen; Capability-UI; strenge `ctx`-API
  diszipliniert Baustein-Autoren (bewusst).
- Offen: exakte Worker-Technologie (worker_threads vs. isolated-vm — Folgeentscheidung
  mit Sicherheits-Review), State-Persistenz-Format je Baustein, Capability-Katalog v1.
