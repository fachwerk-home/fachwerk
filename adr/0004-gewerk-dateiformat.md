# ADR-0004: Gewerk-Dateiformat

- **Status:** Akzeptiert (2026-07-09)
- **Datum:** 2026-07-09
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)
- **Bestätigt:** stabile Schlüssel statt Zahl-IDs · YAML · Layout getrennt von Semantik.

## Kontext

Das **Gewerk** (die konfigurierte Gebäudesteuerung eines Nutzers, siehe GLOSSAR) ist bei
Fachwerk **deklarativer Text** — das ist die Kernwette (Plan § 4.1). Aus diesem Format hängt
fast alles:
- **Editor = Ansicht darauf** (Logik-/Visueditor lesen/schreiben es).
- **Agent-first**: Agenten erzeugen/ändern **dieselben** Dateien über API/MCP.
- **Historie/Diff/Rollback** (BACKLOG B-2) via Git — braucht **kleine, sinnvolle Diffs**,
  nicht einen Monolithen (EDOMIs Schwäche: alles in MySQL-Blobs → nicht diffbar).
- **Validierung & Linting**: schema-geprüft; statische Analyse für typische Gefahren
  (Mehrfach-Schreiber eines Datenpunkts; Konvergenz-/Settle-Topologie; unaufgelöste
  Referenzen; Zyklen).
- **Partielle/heiße Aktivierung** (B-1): granular je Artefakt.

## Optionen (die drei Grundentscheidungen)

1. **Granularität:** eine große Datei je Gewerk **vs. Verzeichnisbaum** (je Artefakt eine
   Datei). Großdatei = riesige Diffs, Merge-Konflikte, kein paralleles Arbeiten. Baum =
   kleine Diffs, paralleles Editieren, heiße Teil-Aktivierung.
2. **Formatsprache:** JSON (eindeutig, aber laut, keine Kommentare) · **YAML** (lesbar,
   Kommentare, gute Diffs; Footguns beherrschbar via Schema + kanonischem Serializer) ·
   TOML (gut für flache Config, schwach für verschachtelte Graphen).
3. **Referenzen/IDs:** opake Zahl-IDs (wie EDOMI) **vs. menschenlesbare, stabile Schlüssel**
   (z. B. `wohnen.deckenlicht`). Schlüssel sind diff- und agentenfreundlicher.

## Entscheidung

**Verzeichnisbaum, je Artefakt eine YAML-Datei, JSON-Schema-validiert, mit
menschenlesbaren stabilen Schlüsseln und kanonischer (deterministischer) Serialisierung.**

### Verzeichnisstruktur (Vorschlag)
```
gewerk/
  gewerk.yaml            # Manifest: Name, format_version (semver), Metadaten
  datapoints/            # Datenpunkte, thematisch gruppiert (eine Datei je Gruppe)
    wohnen.yaml
    heizung.yaml
  logic/                 # eine Datei je Logikseite
    beschattung-sued.yaml
  visu/                  # eine Datei je Visuseite
    erdgeschoss.yaml
  drivers/               # Treiber-Konfiguration (KNX, MQTT …)
    knx.yaml
  archives/              # Datenarchiv-Definitionen
  scenes/                # Szenen, Zeit-/Terminschaltungen
  templates/             # wiederverwendbare Visu-/Logik-Vorlagen
```

### Prinzipien
- **Kanonische Serialisierung:** Der Editor/die API schreibt Dateien in stabiler
  Schlüsselreihenfolge und Formatierung. Eine kleine Änderung ⇒ ein kleiner Diff. (Nicht
  verhandelbar — sonst ist die Git-Historie unbrauchbar.)
- **Stabile Schlüssel** statt Zahl-IDs für Referenzen; eindeutig je Typ. Umbenennen ist eine
  bewusste Refactor-Operation (aktualisiert Referenzen).
- **Logik = expliziter Graph** (Knoten = Bausteine, Kanten = Verbindungen) im Text —
  damit statisch analysierbar (Linter, Settle-Analyse). Der visuelle Editor rendert den
  Graphen; der Text *ist* der Graph.
- **Layout getrennt von Semantik:** Editor-Positionen (x/y, Zoom) in einem `layout`-Block
  bzw. einer Sidecar-Sektion, damit reines Verschieben keinen semantischen Diff erzeugt.
- **Schema-getrieben:** JSON-Schema je Artefakttyp → speist (a) Editor-UI mit Progressive
  Disclosure (SPEC-003 R-7), (b) `fachwerk validate` (headless, CI, agenten-tauglich),
  (c) die Linter (u. a. Mehrfach-Schreiber-Warnung).
- **`format_version`** (semver) im Manifest → Migrationspfad bei Formatänderungen.

### Beispiele (illustrativ, nicht final)

`datapoints/wohnen.yaml`:
```yaml
datapoints:
  deckenlicht:
    name: "Deckenlicht Wohnen"
    type: knx            # knx | internal | system
    ga: "1/1/0"
    dpt: "1.001"
    remanent: true
    protected: false      # locks/alarm → true, nie agenten-schreibbar (Plan § 4.2)
  lichtszene:
    name: "Lichtszene Wohnen"
    type: internal
    datatype: variant
    initial: 0
```

`logic/flur-licht.yaml`:
```yaml
sheet: "Flur Licht"
blocks:
  in_taster:   { type: input,      datapoint: flur.taster }
  treppenlicht:{ type: staircase,  params: { duration_s: 180 } }
  out_licht:   { type: output,     datapoint: flur.licht, send: on_change }
connections:
  - from: in_taster.out
    to:   treppenlicht.trigger
  - from: treppenlicht.out
    to:   out_licht.in
layout:                 # nur Editor-Kosmetik, kein semantischer Diff
  in_taster:   { x: 40,  y: 60 }
  treppenlicht:{ x: 240, y: 60 }
  out_licht:   { x: 440, y: 60 }
```

## Konsequenzen

- **Diff-freundlich & parallel editierbar**; Git-Historie/Diff/Rollback (B-2) werden nutzbar.
- **Ein Modell für Editor und Agent** (ADR-0003) — beide schreiben denselben kanonischen Text.
- **Statische Analyse möglich:** Linter für Mehrfach-Schreiber, Zyklen, unaufgelöste
  Referenzen, Konvergenz-/Settle-Topologie — zur Projektierungszeit.
- **Heiße Teil-Aktivierung (B-1)** wird greifbar, weil Artefakte einzeln adressierbar sind.
- **Kosten:** Wir brauchen einen **kanonischen Serializer** und müssen die JSON-Schemas
  pflegen. Der EDOMI-Import-Assistent (Phase 6) mappt EDOMI-Objekte auf dieses Format.
- **Folge-Specs:** je Artefakttyp ein Schema-Spec (Datapoint, Logikseite, Visuseite,
  Treiber, Archiv) — iterativ, aufbauend auf SPEC-001/002/003.
- **Offen:** genaue Bindungssyntax der Visu-Elemente (SPEC-003 F-4); ob `layout` inline oder
  Sidecar; Namensraum-/Ordner-Konventionen für Schlüssel.
