# AUFTRAG P5-6: Visu-Format (Schema + Format-Kaskade + Ausdrucks-Parser)

- **Spur:** 2 (Auftrags-Agent)
- **Branch:** `auftrag/p5-6-visu-format` (Basis: aktueller `main`)
- **Abgabe:** Pull Request gegen `main`; Merge macht der Maintainer.
- **Regeln:** `AGENTS.md` ist bindend — VOR Arbeitsbeginn vollständig lesen.

## Kontext (reicht ohne weitere Vorgeschichte)

Fachwerk ist eine deklarative KNX-Logik-/Visu-Plattform. Ein **Gewerk** (die
Konfiguration eines Hauses) ist ein Verzeichnis aus YAML-Dateien:
`gewerk.yaml`, `datenpunkte/*.yaml`, `logik/*.yaml`, `bausteine/*`. Dieser
Auftrag fügt die vierte Säule hinzu: **`visu/`** — das deklarative Format für
Visualisierungsseiten. Es wird später von einem Renderer (P5-7), einem Editor
(P5-10) und einem Importer (P5-9) benutzt — DU baust nur Format + Kernlogik,
nichts davon.

## Pflichtlektüre (in dieser Reihenfolge)

1. `AGENTS.md` — Arbeitsregeln, Clean Room, Qualitäts-Gates
2. `adr/0010-layout-responsivitaet.md` — Identität ≠ Platzierung (L-1),
   Canvas/Pinned je Breakpoint (L-2), Basis-Breakpoint + Ableitung (L-4)
3. `adr/0011-format-kaskade.md` — FMT-1..FMT-4
4. `specs/SPEC-003-visu-elemente.md` — R-8/R-9/R-10/R-11, Elementkatalog F-1,
   **Anhang A** (Ausdrucksgrammatik — exakt so implementieren)
5. `specs/SPEC-001-ko-modell.md` — Datenpunkt-Modell, Format-Felder je Typ
6. `adr/0004-gewerk-dateiformat.md` + `core/src/gewerk/canonical.ts` —
   kanonische YAML-Serialisierung (kleine Diffs)
7. Als Code-Muster: `schema/src/index.ts`, `core/src/gewerk/loader.ts`,
   je ein `*.test.ts` in `core/src/`

## Dateibesitz (NUR diese Pfade ändern/anlegen)

- `schema/schemas/visu-seite.schema.json`, `schema/schemas/visu-designs.schema.json` (neu)
- `schema/src/visu.ts` (neu) — Typen + kompilierte Validatoren
- `schema/schemas/datenpunkte.schema.json` + `schema/src/index.ts` — NUR um
  das optionale `format`-Objekt am Datenpunkt zu ergänzen (FMT-1 Ebene 1)
  bzw. `export * from "./visu.ts";` und KEY_ORDER-Einträge ANZUFÜGEN
- `core/src/visu/` (neu): `laden.ts`, `format.ts`, `ausdruck.ts` + Tests
- `core/src/index.ts` — nur eigene Export-Zeilen anfügen
- `examples/minimal/visu/` (neu) — handgeschriebene Beispiel-Visu
- `specs/SPEC-003-visu-elemente.md` — nur präzisieren, falls beim Bauen
  Detail-Lücken auffallen (als eigener Commit, klein)

**Tabu:** alles andere — insbesondere `core/src/api/`, `cli/`, `ui/`,
`Dockerfile`, `.github/`, `_ingest/`, `research/`.

## Lieferumfang

### 1. Datenpunkt-Format (FMT-1 Ebene 1, FMT-2)

Optionales `format`-Objekt am Datenpunkt (Schema + TS-Typ `WertFormat`),
deklarative Felder, KEIN Ausdruck nötig für den Normalfall:
`einheit` · `dezimalstellen` · `skalierung` · `offset` · `tausendertrenner`
(bool) · `enum_map` (Wert→Text) · `bool_map` ({wahr, falsch}) · `template`
(String, Fluchtweg FMT-3). Felder gemäß SPEC-001-Tabelle je Typ.

### 2. Visu-Schema (`visu/seiten/<seite>.yaml`, `visu/designs.yaml`)

Richtschnur (Feinheiten darfst du sinnvoll ausgestalten; bei Zweifel Frage im
PR statt stillschweigender Grundsatzentscheidung):

```yaml
# visu/seiten/wohnzimmer.yaml
typ: seite            # seite | popup | include
name: Wohnzimmer
basis: tablet         # Basis-Breakpoint (ADR-0010 L-4)
groessen:
  tablet: { w: 1280, h: 800 }
  handy: { w: 390, h: 844 }
elemente:
  licht_decke:        # stabiler Schluessel = Identitaet (L-1)
    preset: schalter  # F-1: Preset des Basiselements ODER widget: slider|...
    bindungen:        # Rollen (R-8)
      set: wohnen.licht_decke
      status: wohnen.licht_decke_status
    design: standard  # Verweis auf designs.yaml; plus optional dynamisch (R-9)
    design_je_wert:   # R-9: Wert→Design-Override
      - { wenn: true, design: aktiv }
    aktionen:
      kurz: { art: umschalten }        # oder setze: <wert> | seite: <key> | popup: <key>
    format: { dezimalstellen: 1 }      # Element-Override (FMT-1 Ebene 2)
    placements:                        # 0..n, je Breakpoint (L-1/L-2)
      tablet: { x: 40, y: 40, w: 120, h: 120 }
      handy: { x: 16, y: 40, w: 80, h: 80, format: { dezimalstellen: 0 } }
      # fehlt ein Breakpoint: erbt Basis-Geometrie (L-4); sichtbar: false = ausblenden
```

```yaml
# visu/designs.yaml  (R-4/F-3: benannte Vorlagen)
standard: { hintergrund: "#222", text: "#eee", rand: { staerke: 1, farbe: "#444" } }
aktiv: { hintergrund: "#fc0", text: "#000" }
```

Presets aus SPEC-003 F-1 Tabelle A als Enum; Widgets (Tabelle B) als `widget:`
mit eigenem Parameterobjekt — für v1 reichen `slider` und `diagramm` als
Schema-Platzhalter (Renderer kommt später).

### 3. `core/src/visu/laden.ts`

`ladeVisu(gewerkVerzeichnis)` → `{seiten, designs, fehler}` — liest
`visu/seiten/*.yaml` + `visu/designs.yaml`, validiert gegen die Schemas,
prüft Querbezüge (Bindungen zeigen auf existierende Datenpunkte NUR wenn
Registry-Definitionen übergeben werden — als optionaler Parameter; Design-
Verweise existieren; Breakpoint-Namen in placements ⊆ groessen). Fehler
sammeln und benennen (Datei, Element, Grund) — Muster `core/src/gewerk/loader.ts`.
Fehlendes `visu/` ist KEIN Fehler (Gewerke ohne Visu bleiben gültig).

### 4. `core/src/visu/format.ts` (pure Funktionen, FMT-1/FMT-2/FMT-4)

- `effektivesFormat(dpFormat?, elementFormat?, placementFormat?)` → Merge je
  Feld, spezifischere Ebene gewinnt, nicht gesetzte Felder fallen zurück.
- `formatiereWert(wert, format)` → String: Skalierung/Offset anwenden (NUR
  Anzeige, FMT-4), runden auf `dezimalstellen`, `tausendertrenner`
  (de-DE-Stil: Punkt), `enum_map`/`bool_map`, Einheit anhängen; wenn
  `template` gesetzt → Ausdrucks-Engine (5.).

### 5. `core/src/visu/ausdruck.ts` (SPEC-003 Anhang A, exakt)

Eigener Tokenizer + rekursiver Abstiegsparser nach der Grammatik in Anhang A —
**kein `eval`, kein `new Function`**. Template-Text mit `{…}`-Löchern;
Wertreferenzen `#` und `#{schluessel}` (Auflösung über eine übergebene
Lookup-Funktion). Funktions-Whitelist exakt wie Anhang A. **Pur und total:**
Laufzeitfehler (unbekannte Funktion, Typkonflikt, Division durch 0, fehlender
Datenpunkt) führen NIE zu einer Exception nach außen — Rückgabe ist der
Rohwert als String plus maschinenlesbare Fehlerliste. Parse einmal, werte oft
aus (kompilierte Form zurückgeben).

### 6. Beispiel + Tests

`examples/minimal/visu/` mit einer Seite (2 Breakpoints, mind. ein Element mit
Placement-Format-Override) + `designs.yaml`. Tests (node:test, neben den
Quelldateien): Schema-Validierung gut/schlecht, Kaskaden-Auflösung alle 3
Ebenen, formatiereWert je Feldtyp, Ausdrucks-Engine (Grammatik-Fälle aus
Anhang A inkl. `{fixed(#,1)} °C`, Ternary, map(), Fehlerfälle → total),
ladeVisu gegen das Beispiel.

## Nicht-Scope (kommt in anderen Schnitten)

Renderer/UI (P5-7) · Schreibpfad (P5-8) · Import aus Altsystem (P5-9) ·
Editor (P5-10) · CLI-`validate`-Verdrahtung (macht Spur 1 beim Merge —
im PR als Integrationswunsch notieren).

## Abnahme (alles muss erfüllt sein)

1. `pnpm typecheck && pnpm lint && pnpm test && bash tools/check-repo.sh` grün.
2. Neue Laufzeit-Deps: KEINE (`pnpm-lock.yaml` unverändert).
3. `examples/minimal/visu/` validiert über `ladeVisu` ohne Fehler; ein
   absichtlich kaputtes Fixture liefert benannte Fehler (Datei+Element+Grund).
4. Format-Kaskade: Test beweist Datenpunkt→Element→Placement-Präzedenz und
   Rückfall nicht gesetzter Felder.
5. Ausdrucks-Engine: kein `eval`; Fehlerfälle liefern Fallback statt Wurf;
   `{fixed(#,1)} °C` mit Wert 21.37 ergibt exakt `21.4 °C`.
6. Alle Commits nach AGENTS.md § 5 (deutsch, Schnitt-Nummer `P5-6:`, keine
   Backticks, Co-Authored-By-Trailer).
7. PR-Beschreibung: Was gebaut, welche Detailentscheidungen getroffen, offene
   Fragen, Integrationswünsche an Spur 1.
