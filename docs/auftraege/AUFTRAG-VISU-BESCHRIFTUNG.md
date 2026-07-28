# AUFTRAG VISU-BESCHRIFTUNG: Text wechselt mit dem Zustand (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/visu-beschriftung`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md`, `ui/src/visu/modell.ts`, `ui/src/visu/main.tsx`,
  `schema/src/visu.ts` (Feld `beschriftung`).

## Warum

Ein Schalter in der importierten Visu des Betreibers zeigt „OFF". Schaltet er
ein, soll dort „ON" stehen — im Altsystem tut er das. Bei uns bleibt „OFF"
stehen, obwohl die Farben inzwischen korrekt wechseln.

Die Daten sind seit `a876ade` + Folgecommit vollständig da: wertabhängige
Designs kommen als `design_je_wert` an, und ein solches Design kann eine
**`beschriftung`** tragen. Es fehlt nur, dass der Renderer sie benutzt.

## Die Regel (aus der geprüften Interop-Spec)

> Trägt das gerade geltende wertabhängige Design eine `beschriftung`, wird
> **sie** angezeigt. Sonst der `text` des Elements.

Entweder-oder, nie beides, keine Überlagerung. Das Basisdesign (`design`) trägt
nie eine `beschriftung` — nur Regeln aus `design_je_wert` können eine haben.

## Umfang

1. In `ui/src/visu/modell.ts` gibt es bereits `designFuer(element, designs,
   status)`, das Basis- und wertabhängiges Design mischt. Die Beschriftung
   folgt derselben Auswahl: gilt eine Regel und bringt sie eine
   `beschriftung` mit, ersetzt sie den Elementtext.
2. Die Anzeige (`elementAnzeige` bzw. der Ort, an dem heute `element.text`
   zum Label wird) benutzt das Ergebnis. **Alle** Presets, nicht nur Schalter —
   im Bestand des Betreibers hängt es an `label`-Elementen.
3. **Symbole nicht kaputtmachen:** `beschriftung` enthält häufig einen Glyph
   aus der Panel-Schrift (Private-Use-Area, z. B. U+EA7B) statt eines Wortes.
   Der bestehende Symbolpfad (`einzelnesPrivatesSymbol`) muss auch für die
   Beschriftung greifen, sonst wechselt ein Icon-Schalter auf ein leeres
   Kästchen. Das ist der wahrscheinlichste Weg, diesen Auftrag falsch
   abzuschliessen — bitte ausdrücklich prüfen.

## Nicht-Scope

- `core/**`, `cli/**`, `schema/**`, `importer/**` — die Daten stehen schon.
- Keine neue Formatierung, keine Wertdarstellung: `beschriftung` ist ein
  fertiger Text bzw. ein Glyph und wird unverändert angezeigt.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktion mit Tests, mindestens: (a) Regel gilt und hat
  `beschriftung` → sie gewinnt; (b) Regel gilt ohne `beschriftung` →
  Elementtext; (c) keine Regel gilt → Elementtext; (d) `beschriftung` ist ein
  Private-Use-Glyph → wird als Symbol behandelt, nicht als Text.
- Handprobe im PR gegen `examples/` — Betreiberdaten gehören nicht ins Repo.
