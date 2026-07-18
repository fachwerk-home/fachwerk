# AUFTRAG P5-13a: Archiv-Kern (Zeitreihen-Definition, Schreiber, Abfrage)

- **Spur:** 3 (Auftrags-Agent)
- **Branch:** `auftrag/p5-13a-archiv-kern` (Basis: aktueller `main`)
- **Abgabe:** Pull Request gegen `main`; Merge macht der Maintainer.
- **Regeln:** `AGENTS.md` ist bindend — VOR Arbeitsbeginn vollständig lesen.

## Kontext (reicht ohne weitere Vorgeschichte)

Fachwerk ist eine deklarative KNX-Logik-/Visu-Plattform. Ein **Gewerk** (die
Konfiguration eines Hauses) ist ein Verzeichnis aus YAML-Dateien. Datenpunkte
tragen Live-Werte (bool/zahl/text); eine Registry im Prozess hält sie. Dieser
Auftrag baut die **Zeitreihen-Archivierung als eigenständiges, getestetes
Kern-Modul**: Definitionen im Gewerk, Schreiber auf SQLite, Abfrage mit
Zeitraster. Die Verdrahtung (wer `erfasse()` bei Wertänderung aufruft, der
HTTP-Endpunkt `/api/archive/...`, das Diagramm-Widget) ist NICHT Teil dieses
Auftrags — das macht Spur 1 in P5-13b.

## Pflichtlektüre (in dieser Reihenfolge)

1. `AGENTS.md` — Arbeitsregeln, Clean Room, Qualitäts-Gates
2. `specs/SPEC-004-archive.md` — aktuell dünn; Teil deines Auftrags ist, sie
   gemäß diesem Auftrag auszuformulieren (das Verhalten, das du baust)
3. `adr/0006-datenhaltung.md` — SQLite-Linie
4. Als Code-Muster: `core/src/persistenz/speicher.ts` (+ Test) — so nutzen
   wir `node:sqlite`; `core/src/system/uhr.ts` — injizierbare Uhr;
   `core/src/gewerk/loader.ts` — YAML laden + validieren mit benannten
   Fehlern; `schema/src/index.ts` — Schema-Paket-Muster
5. `specs/SPEC-001-ko-modell.md` — Datenpunkt-Modell (Typen bool/zahl/text)

## Dateibesitz (NUR diese Pfade ändern/anlegen)

- `schema/schemas/archiv.schema.json` (neu)
- `schema/src/archiv.ts` (neu) — Typen + kompilierter Validator
- `schema/src/index.ts` — nur `export * from "./archiv.ts";` ANFÜGEN
- `core/src/archiv/` (neu): `laden.ts`, `dienst.ts` + Tests
- `core/src/index.ts` — nur eigene Export-Zeilen anfügen
- `specs/SPEC-004-archive.md` — ausformulieren
- `examples/minimal/archiv/` (neu) — eine Beispiel-Definition

**Tabu:** alles andere — insbesondere `core/src/api/`, `core/src/datenpunkte/`,
`cli/`, `ui/`, `Dockerfile`, `.github/`, `_ingest/`, `research/`.

## Lieferumfang

### 1. Definition im Gewerk: `archiv/*.yaml`

Jede Datei ist eine Map `archiv-id → Definition` (Muster wie
`datenpunkte/*.yaml`). Richtschnur (Feinheiten sinnvoll ausgestalten; bei
Zweifel Frage im PR statt stillschweigender Grundsatzentscheidung):

```yaml
# archiv/klima.yaml
aussen_temperatur:
  name: Außentemperatur
  quelle: aussen.temperatur     # Datenpunkt-Schluessel (typ zahl oder bool)
  aufbewahrung_tage: 365        # aeltere Punkte werden geloescht
  mindestabstand_s: 60          # optional: Werte dichter als N Sekunden verwerfen
  notizen: fuer das Wohnzimmer-Diagramm
```

v1 archiviert nur `zahl` und `bool` (bool als 0/1). `text` ist kein Fehler im
Schema-Sinn, wird aber von `laden.ts` als benannter Fehler abgewiesen, wenn
Datenpunkt-Definitionen zur Prüfung übergeben wurden.

### 2. `core/src/archiv/laden.ts`

`ladeArchive(gewerkVerzeichnis, datenpunkte?)` → `{archive, fehler}` — liest
`archiv/*.yaml`, validiert gegen das Schema, prüft bei übergebenen
Datenpunkt-Definitionen: Quelle existiert und ist zahl/bool; Archiv-IDs
gewerkweit eindeutig. Fehlendes `archiv/` ist KEIN Fehler. Fehler benennen
Datei, ID und Grund (Muster `core/src/gewerk/loader.ts`).

### 3. `core/src/archiv/dienst.ts` — `ArchivDienst`

Eigenständige Klasse ohne Kenntnis von Registry/Engine/HTTP:

- **Konstruktor:** `{pfad, archive, jetzt?}` — `pfad` ist die SQLite-Datei
  (`archiv.sqlite` im Datenverzeichnis; `:memory:`-fähig für Tests), `archive`
  die geladenen Definitionen, `jetzt` eine injizierbare Uhr
  (Default `Date.now`, Muster `core/src/system/uhr.ts`).
- **`erfasse(id, wert, ts?)`** — speichert einen Punkt; unbekannte `id` und
  nicht-numerische Werte (nach bool→0/1-Wandlung) werden still ignoriert und
  gezählt (Zähler abfragbar), sie werfen NIE (Bus-Input darf den Prozess nie
  töten). `mindestabstand_s` wird hier durchgesetzt.
- **`frage(id, {von, bis, rasterS?, aggregation?})`** → Punktliste.
  Ohne `rasterS`: Rohpunkte `[{ts, wert}]`. Mit `rasterS`: pro Zeitfenster
  aggregiert `[{ts, wert, min, max, anzahl}]`; `aggregation` =
  `mittel` (Default) | `min` | `max` | `letzter`. Leere Fenster werden
  ausgelassen (keine Null-Füllung). `von > bis` → leere Liste.
- **`raeumeAuf()`** — löscht Punkte älter als `aufbewahrung_tage` je Archiv;
  gibt die Zahl gelöschter Punkte zurück. (Aufruf-Takt entscheidet Spur 1.)
- **`schliesse()`** — DB sauber schließen.
- SQLite: WAL-Modus, eine Tabelle `punkte(archiv_id, ts, wert)` mit Index
  `(archiv_id, ts)`; prepared Statements; Schema-Version in `PRAGMA user_version`
  (Muster `core/src/persistenz/speicher.ts`).

### 4. Tests (node:test, neben den Quelldateien)

- erfassen + Roh-Abfrage (Grenzen inklusive: genau `von`/`bis`)
- Raster-Aggregation: mittel/min/max/letzter je Fenster, leere Fenster fehlen
- `mindestabstand_s` verwirft dichte Werte
- bool→0/1; unbekannte ID/Text-Wert ignoriert + gezählt, kein Wurf
- Aufbewahrung: `raeumeAuf` mit gestellter Uhr löscht nur Altes
- Persistenz: Datei schließen, neu öffnen, Daten noch da
- `ladeArchive`: gutes + kaputtes Fixture (benannte Fehler)

### 5. `specs/SPEC-004-archive.md` ausformulieren

Verhalten wie gebaut dokumentieren (Definition, Erfassungsregeln, Abfrage-/
Aggregations-Semantik, Aufbewahrung). Kennzeichne v1-Grenzen (nur zahl/bool,
keine Verdichtungs-Stufen) als „Offene Ausbaustufen".

## Nicht-Scope (kommt in anderen Schnitten)

Anbindung an Registry/Engine (wer `erfasse` aufruft) · HTTP-API ·
Diagramm-Widget · Import der Altsystem-Archivbefehle (P5-13c) ·
Verdichtungs-Stufen/Downsampling-Speicherung.

## Abnahme (alles muss erfüllt sein)

1. `pnpm typecheck && pnpm lint && pnpm test && bash tools/check-repo.sh` grün.
2. Neue Laufzeit-Deps: KEINE (`node:sqlite` ist eingebaut; `pnpm-lock.yaml`
   unverändert).
3. `ArchivDienst` wirft bei keinem Eingabefehler; Zähler belegt Ignoriertes.
4. Abfrage-Semantik durch Tests bewiesen (inkl. Fenstergrenzen und Default
   `mittel`).
5. Beispiel unter `examples/minimal/archiv/` lädt über `ladeArchive` ohne
   Fehler.
6. Alle Commits nach AGENTS.md § 5 (deutsch, Schnitt-Nummer `P5-13a:`, keine
   Backticks, Co-Authored-By-Trailer).
7. PR-Beschreibung: Detailentscheidungen, offene Fragen, Integrationswünsche
   an Spur 1 (z. B. gewünschter Aufruf-Takt für raeumeAuf).
