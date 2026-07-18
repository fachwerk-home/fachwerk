# Phase 5 — API & Frontend (detaillierter Arbeitsplan)

- **Status:** In Arbeit (Start 18.07.2026)
- **Bezug:** Plan § 4/§ 5 (Zielbild, Phase 5), ADR-0009 (API/MCP), ADR-0010 (Layout),
  ADR-0011 (Format-Kaskade), ADR-0012 (konfig-variable Ports), SPEC-003 (Visu),
  SPEC-004 (Archive)
- **Arbeitsmodus:** Ein Schnitt = ein abgeschlossener, getesteter, committeter
  Baustein. Jeder Schnitt ist so beschrieben, dass ein Agent ihn OHNE weiteren
  Kontext übernehmen kann (Scope, Nicht-Scope, Akzeptanz). Reihenfolge beachten —
  Abhängigkeiten sind angegeben.

## Zielbild (aus Plan § 4)

```
┌────────────────────────────────────────────────────────┐
│  Admin-/Projektierungs-UI (Web)     Visu-Client (PWA)  │
└──────────────┬─────────────────────────┬───────────────┘
               │ REST + WebSocket        │ WebSocket
┌──────────────┴─────────────────────────┴───────────────┐
│  fachwerk-Kern (Engine, Registry, Treiber) — headless  │
└────────────────────────────────────────────────────────┘
```

Phase 5 liefert das VOLLSTÄNDIGE Frontend: Status/Monitor → Visu-Renderer →
Visu-Editor → Logik-Editor (aus Phase 4 hierher verschoben) → Archive/Diagramme.
Die UI ist immer nur ein API-Client (ADR-0009 A-1: keine privilegierten
Hintertüren) — deshalb beginnt der Plan mit der API.

**Abnahme der Phase (Plan § 5):** Die Haupt-Visuseiten des Betreibers sind im
neuen System nachgebaut und alltagstauglich (Panel + Handy).

---

## Parallelisierung (Spuren & Dateibesitz)

Ab Block B wird in parallelen **Spuren** gearbeitet (Regeln: `AGENTS.md` § 3).
Jede Spur besitzt disjunkte Dateien; Auftrags-Spuren liefern per Branch + PR,
Spur 1 reviewt, merged und verdrahtet.

| Spur | Agent | Schnitt(e) | Dateibesitz (exklusiv) | Auftrag |
|---|---|---|---|---|
| 1 | Claude (Maintainer) | P5-4, P5-5, Integration | `cli/`, `ui/`, `core/src/api/`, `Dockerfile`, `.github/`, `tools/`, Compose | — |
| 2 | Codex | P5-6 Visu-Format | `schema/src/visu.ts`, `core/src/visu/`, `examples/minimal/visu/`, `specs/SPEC-003` (nur Präzisierung) | `docs/auftraege/AUFTRAG-P5-6.md` |
| 3 | Gemini | P5-13a Archiv-Kern | `schema/src/archiv.ts`, `core/src/archiv/`, `specs/SPEC-004` | `docs/auftraege/AUFTRAG-P5-13a.md` |

Sammel-Exporte (`core/src/index.ts`, `schema/src/index.ts`): Zeilen nur
anfügen — Merge-Konflikte bleiben trivial.

**Abhängigkeiten (wer wen blockiert):**

```
P5-4 ─▶ P5-5                         (Spur 1, sequenziell)
P5-6 ─▶ P5-7 ─▶ P5-8 ─▶ P5-10(a)     (Visu-Kette; P5-7 braucht P5-6-Merge)
P5-6 ─▶ P5-9                         (Import braucht das Zielformat)
P5-5 ─▶ P5-11                        (Logik-Editor baut auf Monitor)
P5-13a ─▶ P5-13b (API+Widget, Spur 1) und P5-13c (Import cmd 13/40/42)
P5-12 zuletzt (härtet alles davor)
```

P5-4/5, P5-6 und P5-13a sind wechselseitig unabhängig → drei Spuren parallel.
Danach sinnvoll: Spur 2 → P5-9 (nach P5-6-Merge), Spur 3 → P5-13c; die
UI-lastigen Schnitte P5-7/8/10/11 bleiben bei Spur 1 (Hotspot-Dateien).

---

## Block A — Fundament

### P5-0: Log-Hygiene ✅ (erledigt 18.07.2026)
`FACHWERK_TRACE=kompakt|voll|aus` (Default kompakt: leere Kaskaden — z. B.
sekündlicher Uhr-Tick ohne feuernde Bausteine — werden nicht geloggt).

### P5-1: ADR-0013 — UI-Stack festlegen ✅ (erledigt 18.07.2026)
- **Ziel:** Verbindliche Technologie-Entscheidung für beide UIs.
- **Zu entscheiden:** Framework (Kriterien: klein, TS-first, agentenfreundlich =
  von LLMs gut beherrscht, langfristig wartbar; Kandidaten: Preact, React,
  Svelte, SolidJS, Lit), Build (Vite), Verzeichnislayout (`ui/` als
  Workspace-Paket `@fachwerk/ui`), Dev-Server-Proxy auf die API, Auslieferung
  (statisch aus dem fachwerk-Container, EIN Port, kein zweiter Prozess).
- **Vorschlag zur Diskussion:** Preact + Vite (React-API = maximale
  Agenten-Kompetenz, aber ~4 kB; kein Vendor-Lock).
- **Nicht-Scope:** kein Komponenten-Framework-Zoo; Styling-Entscheidung (plain
  CSS/Custom Properties, keine UI-Kit-Abhängigkeit) gehört mit hinein.
- **Akzeptanz:** ADR akzeptiert; `pnpm --filter @fachwerk/ui dev` startet ein
  Hello-Fachwerk; CI baut die UI; Dockerfile liefert sie aus.

### P5-2: API-Kern (read-only) — ADR-0009 A-1/A-2 Teilmenge ✅ (erledigt 18.07.2026)
- **Ziel:** HTTP-Server im `fachwerk run`-Prozess (Node `http`, keine
  Fremdbibliothek), Env `FACHWERK_HTTP_PORT` (Default 8300; 0 = aus).
- **Endpunkte (alle GET, JSON):**
  - `/api/status` — Gewerk-Name, Uptime, KNX-Status (verbunden, Tunnel-Kanal,
    IA, Modus), MQTT-Status, Anzahl Datenpunkte/Seiten, Version.
  - `/api/datenpunkte` — Liste: Schlüssel, Name, Klasse, Typ, Treiber/Adresse,
    aktueller Wert, Zeitstempel der letzten Änderung. Query: `?filter=text`.
  - `/api/datenpunkte/<schluessel>` — Detail inkl. Definition.
  - `/api/traces?n=100` — die letzten N Kaskaden-Traces (Ringpuffer im
    Prozess, Kapazität konfigurierbar, Default 500; unabhängig vom stdout-Log).
  - `/api/gewerk` — Struktur (Seitenliste, je Seite Knoten+Kanten, Bausteine
    mit Manifesten) für Monitor/Editoren.
- **Sicherheit (Beobachtungs-/DEV-Niveau):** optionales Bearer-Token
  (`FACHWERK_API_TOKEN`); ohne Token nur lesend & nur wenn gesetzt kein 401.
  Volle Scopes (ADR-0009 A-3) kommen in P5-11.
- **Technik:** Registry bekommt Zeitstempel der letzten Änderung je Datenpunkt;
  Trace-Ringpuffer als eigene Klasse in core (testbar).
- **Akzeptanz:** Unit-Tests für Ringpuffer + Handler (Node `http` injectable);
  E2E: `curl` gegen Compose-Stack liefert Status + Werte; CI-Job.

### P5-3: WebSocket-Live-Kanal ✅ (erledigt 18.07.2026)
- **Ziel:** `/api/ws` — Push von `{art:"wert", schluessel, wert, ts}` und
  `{art:"trace", trace}` an alle Clients; Ping/Pong.
- **Technik:** eigene RFC-6455-Serverimplementierung (Upgrade-Handshake,
  Frame-Parser MIT Masking-Pflicht vom Client, Senden unmaskiert; nur
  Text-Frames + Ping/Pong/Close). Konsistent zur Null-Dependency-Linie
  (KNX/MQTT sind auch eigene Clients). ~200 Zeilen + Tests.
- **Nicht-Scope:** keine Client→Server-Kommandos (kommt mit P5-11).
- **Akzeptanz:** Unit-Test Handshake/Frames (Roundtrip gegen eigenen Client im
  Test); E2E: Wertänderung am Simulator erscheint < 1 s im WS-Stream.

---

## Block B — Sichtbarer Nutzen (Monitor)

### P5-4: Status-UI („der Beobachter im Browser")
- **Ziel:** Erste echte Seite — ersetzt das Portainer-Log-Elend.
- **Umfang:**
  - Kopf: Status (KNX/MQTT verbunden, Modus-Banner BEOBACHTUNG, Uptime).
  - Datenpunkt-Tabelle: Live-Werte (WS), Suche/Filter (Gruppe, Text, Klasse),
    Sortierung, „nur geänderte hervorheben".
  - Trace-Liste: **pausierbar**, scrollstabil (kein Auto-Reload-Springen),
    Klick öffnet Kaskaden-Detail (Schritte mit Ein-/Ausgängen,
    Schreibvorgänge, Auslöser inkl. timer/fortsetzung/nachgeholt).
- **Akzeptanz:** Im Compose-Stack: Simulator-Injektion sichtbar als
  Wert-Update + Trace im Browser, ohne Reload; Trace-Pause hält die Ansicht.

### P5-5: Logik-Monitor (read-only)
- **Ziel:** EDOMIs heimliches Killer-Feature, modern: Logikseiten als Graph
  SEHEN, mit Live-Werten.
- **Umfang:** Seitenliste aus `/api/gewerk`; Graph-Rendering (Knoten, Ports,
  Kanten; Auto-Layout reicht — dagre-artig selbst oder simple Layer nach
  Topo-Ordnung); Live-Overlay: letzte Werte an Kanten (aus Traces/DP-Werten),
  feuernde Knoten kurz hervorheben; Stub-Knoten klar markiert
  (Portierungs-TODO); Klick auf Knoten → Parameter + letzter Trace-Schritt.
- **Nicht-Scope:** kein Editieren (P5-10).
- **Akzeptanz:** Alle 14 importierten Seiten des Referenz-Gewerks werden
  gerendert; Licht-Status-Kaskade im Simulator sichtbar „durchlaufend".

---

## Block C — Visualisierung (der Kern von Phase 5)

### P5-6: Visu-Format (Schema + Renderer-Fundament)
- **Ziel:** `visu/` im Gewerk — deklaratives Format nach SPEC-003/ADR-0010/0011.
- **Schema (JSON-Schema + TS-Typen in @fachwerk/schema):**
  - `visu/seiten/<seite>.yaml`: Seitentyp (seite|popup|include), Größe je
    Breakpoint, Element-Instanzen.
  - Element: `key`, `typ` (Basiselement-Preset oder Widget aus SPEC-003 F-1),
    `bindungen` (Rollen display/set/status → Datenpunkt, R-8),
    `placements[breakpoint]` (x,y,w,h, sichtbar, format-Overrides — ADR-0010
    L-1), `design` (Vorlage + dynamische Zuordnung wert→style, R-9), Aktionen
    (kurz/lang: set-Wert, Seite/Popup).
  - `visu/designs.yaml`: Design-Vorlagen (R-4/F-3).
- **Format-Kaskade:** Datenpunkt-Format (SPEC-001) → Element → Placement
  (ADR-0011 FMT-1) implementieren als pure Funktion in core (testbar).
- **Akzeptanz:** Schema validiert; Beispiel-Visu (Handgeschrieben,
  examples/…) lädt; Round-trip kanonisch.

### P5-7: Visu-Renderer + PWA-Client
- **Ziel:** Seiten im Browser rendern — Panel-tauglich.
- **Umfang:** Canvas/Pinned-Rendering (Breakpoint-Wahl nach Viewport,
  ADR-0010 L-2/L-4), Basiselement-Presets (Taster, Schalter, Status, Wert,
  Label, Symbol, Navigation) + Widgets Slider und Dimmwert-Anzeige;
  Live-Bindungen via WS; dynamische Designs (R-9); Format-Kaskade angewandt;
  PWA-Manifest, „Verbindung verloren"-Overlay.
- **Bedienen (set-Rolle):** sendet über die API (P5-8 nötig) — bis dahin
  zeigt der Renderer Bedienelemente deaktiviert im Beobachtungsmodus.
- **Akzeptanz:** Beispiel-Visu läuft auf Desktop + Handy-Viewport; Werte live.

### P5-8: Schreibpfad (API) + Bedienen
- **Ziel:** Erstes kontrolliertes SCHREIBEN über die API.
- **Umfang:** `POST /api/datenpunkte/<schluessel>` `{wert}` — Scope `operate`
  (Token-Pflicht!), verweigert bei `protected` (SPEC-001) und im
  Beobachtungsmodus (Treiber sendet ohnehin nicht — API meldet es ehrlich);
  Rate-Limit (ADR-0009 A-6 minimal); Audit-Zeile (append-only JSONL in
  /daten). UI: Taster/Schalter/Slider funktionieren.
- **Akzeptanz:** E2E: Schalter in UI → Telegramm am Simulator; protected-DP
  und Beobachtungsmodus → 403 mit Grund; Audit-Datei wächst.

### P5-9: Visu-Import (Stufe 3) — Referenz-Visu übernehmen
- **Ziel:** `exportVisu.json` (Userscript-Export; liegt als Nutzdaten vor)
  → `visu/`-Dateien. WICHTIG: reine Nutzdaten-Konvertierung (Clean-Room wie
  Stufe 1/2 — Tabellenstruktur editVisu*, keine Programmlogik).
- **Umfang:** Seiten + Universalelemente → Basiselement-Presets (Mapping
  SPEC-003 F-1; KO1/KO2/KO3 → Rollen display/set/status), Design-Vorlagen →
  designs.yaml, dynamische Designs → wert→style-Zuordnung, Wert-Ausdrücke
  (`{fixed(#,1)}°C`) → Format-Felder wo möglich, sonst Hinweis; Bilder/Fonts
  kopieren; Unbekanntes → Report (Stub-Philosophie: Struktur rein, Lücken
  benannt).
- **Akzeptanz:** Die LCD-Panel-Visu des Betreibers rendert erkennbar; Report
  listet nicht Abbildbares.

---

## Block D — Editoren

### P5-10: Visu-Editor v1 (WYSIWYG)
- **Ziel:** Der Editor, der EDOMI ausgezeichnet hat — modern (R-1/R-2).
- **Umfang:** Canvas mit Drag&Drop, Raster/Snap, Mehrfachauswahl, Ausrichten;
  Palette = Presets + Widgets (SPEC-003 F-1); Eigenschaften-Panel mit
  Progressive Disclosure (R-7: ~5 häufige Felder sofort, Rest „Erweitert");
  Datenpunkt-Picker (Suche über /api/datenpunkte); **Feldpicker** für
  EXTRACT-artige Bindungen (ADR-0012 K-3 via introspizieren);
  Breakpoint-Umschalter (Basis + Ableitung, ADR-0010 L-4); Speichern =
  deklarative Dateien über API (`write:gewerk`), Aktivieren = expliziter
  Schritt (`activate:dev`, ADR-0009 A-4 — Engine lädt Gewerk neu).
- **Voraussetzung dafür in core:** Gewerk-Reload zur Laufzeit (sauberer
  Neustart der Engine im Prozess) — eigener Unterschnitt P5-10a.
- **Akzeptanz:** Eine Seite im Editor bauen → aktivieren → im Client bedienen,
  ohne Container-Restart; Editor-Ausgabe ist kanonisches YAML (git-diff-klein).

### P5-11: Logik-Editor v1
- **Ziel:** Verdrahten im Browser (aus Phase 4 hierher verschoben).
- **Umfang:** aufbauend auf P5-5 (Monitor): Knoten aus Palette (Stdlib +
  eigene Bausteine via Manifest, inkl. konfig-variabler Ports ADR-0012 K-1 —
  Ports erscheinen nach Parametrierung), Kanten ziehen (dp- und
  Port-Endpunkte), Parameter-Formulare aus Manifest, Validierung live
  (analysiereLogik via API: Zyklen/Mehrfach-Schreiber), Trigger je Eingang
  (E-4) einstellbar; speichern/aktivieren wie P5-10.
- **Akzeptanz:** Licht-Status-Seite im Editor nachbauen → identisches
  Verhalten am Simulator; Zyklus einbauen → Validierung zeigt ihn mit Ort.

### P5-12: Auth & Scopes (DEV-Niveau) + Härtung
- **Ziel:** ADR-0009 A-3/A-4 real: Login (Argon2-Hash, Session-Cookie ODER
  Token), Scopes read/operate/write:gewerk/activate:dev durchgesetzt,
  protected doppelt (API + Engine — Engine-Seite existiert), CORS/Headers,
  Rate-Limits. PROD-Freigabe-Workflow bleibt Phase 6.
- **Akzeptanz:** Ohne Auth kein Schreiben; Scope-Matrix als Test.

---

## Block E — Daten fürs Wohnzimmer

### P5-13: Archive & Diagramme (SPEC-004 minimal) — in drei Teilen
- **P5-13a Archiv-Kern (parallelisierbar, Spur 3):** Datenarchiv-Definition im
  Gewerk (`archiv/*.yaml`: Quelle-DP, Aufbewahrung, Raster), Schreiber in core
  (SQLite, ADR-0006), Abfrage-Funktion mit Raster/Aggregation — als
  eigenständiges, getestetes Modul OHNE API-/UI-Verdrahtung. Details:
  `docs/auftraege/AUFTRAG-P5-13a.md`.
- **P5-13b API + Widget (Spur 1, braucht 13a):** `/api/archive/<id>?von&bis&raster`,
  Visu-Widget Diagramm (Linie, Zeitachse, Zoom grob).
- **P5-13c Import (braucht 13a):** Ausgangsbox-Befehle cmd 13/40/42 →
  Archiv-Definitionen (die 4 wartenden Archiv-Seiten des Referenz-Gewerks!).
- **Akzeptanz (gesamt):** Temperatur läuft am Simulator auf, Diagramm zeigt
  Verlauf nach Neustart weiter (Persistenz).

---

## Querschnitt & Grundsätze

- **Jeder Schnitt:** Tests (Unit + wo sinnvoll E2E im Compose), Lint/Typecheck
  grün, Hygiene-Check, Commit mit Schnitt-Nummer, CI erweitert.
- **Agent-first bleibt Gesetz:** ALLES, was ein Editor kann, geht über die API;
  die deklarativen Dateien sind die Wahrheit (R-5). MCP-Erweiterung der neuen
  Endpunkte folgt am Blockende (dünner Adapter, ADR-0009 A-7).
- **Keine neuen Laufzeit-Abhängigkeiten im Kern** (HTTP/WS selbst); die UI darf
  ihr Framework (P5-1) + Vite als Build-Zeit-Abhängigkeit nutzen.
- **Beobachtungsmodus bleibt heilig:** kein UI-Schreibpfad umgeht ihn.
- **Empfohlene Reihenfolge:** A → B → C → D → E; nach P5-4 gibt es bereits
  täglichen Nutzen (Monitor am echten Bus), nach P5-7 die erste bedienbare
  Visu am Simulator, nach P5-9 die eigene Haus-Visu sichtbar.
