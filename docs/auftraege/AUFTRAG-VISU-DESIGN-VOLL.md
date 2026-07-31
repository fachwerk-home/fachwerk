# AUFTRAG VISU-DESIGN-VOLL: die vollständigen Design-Angaben zeichnen (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/visu-design-voll`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md`, `ui/src/visu/main.tsx` (Design → CSS),
  `schema/src/visu.ts` (`VisuDesign`, `VisuRand`, `VisuSchatten`).

## Warum

Der Import las bisher 13 von 25 belegten Design-Angaben. Die übrigen zwölf sind
genau das, was **designgesteuerte** Elemente ausmacht: Schriftschnitt, Schatten,
Rahmenmuster, Innenabstand, Eckenradien, Hintergrundbild. Ein Schiebeschalter,
dem man Schatten und Eckenradien wegnimmt, sieht aus wie ein Knopf — und genau
so sieht die importierte Visu des Betreibers derzeit aus.

Der Import liefert diese Angaben jetzt. Es fehlt, dass der Renderer sie zeichnet.

## Neue Felder in `VisuDesign`

| Feld | Typ | CSS-Entsprechung |
|---|---|---|
| `schriftstil` | `"normal" \| "kursiv"` | `font-style` |
| `schriftstaerke` | `"normal" \| "fett"` | `font-weight` |
| `polsterung` | Zahl (px) | `padding` |
| `versatz` | `{x?, y?}` (px) | Verschiebung gegenüber der Platzierung |
| `bild` | Dateiname aus `visu/dateien/` | `background-image` |
| `schatten` | `{x, y, unschaerfe, ueberstand, farbe, innen?}` | `box-shadow` (`innen` → `inset`) |
| `textschatten` | `{x, y, unschaerfe, farbe}` | `text-shadow` |
| `rand.muster` | `"linie" \| "punkte" \| "striche"` | `border-style` (`solid`/`dotted`/`dashed`) |
| `rand.farben` | `{links?, oben?, rechts?, unten?}` | Rahmenfarbe je Seite |
| `rand.radien` | `{ol?, or?, ur?, ul?}` | Eckenradius je Ecke, ab oben links im Uhrzeigersinn |

**`farben` und `radien` stehen NEBEN `farbe`/`radius`, nicht statt ihrer.** Der
Import schreibt die einfache Form, solange alle Seiten bzw. Ecken gleich sind —
das ist der Normalfall und darf nicht schwerer zu lesen werden. Sind sie
ungleich, kommt die ausführliche Form. Regel im Renderer: **ist die
ausführliche Form gesetzt, gewinnt sie.**

## Umfang

1. Alle zehn Felder in die erzeugten CSS-Eigenschaften übersetzen.
2. `bild`: die Datei liegt unter `visu/dateien/` und wird über die bestehende
   Route ausgeliefert, die auch die Schriften bedient. Kein Pfad im Design —
   nur der Name (ADR-0015 D-2).
3. `versatz` verschiebt gegenüber der Platzierung, ersetzt sie **nicht**.
4. Fehlt ein Feld, ändert sich nichts — heutiges Aussehen bleibt.

## Nicht-Scope

- `core/**`, `cli/**`, `schema/**`, `importer/**` — die Daten stehen.
- Animation (`s39`–`s41`): eigener Auftrag (B7), hier nicht anfassen.
- Keine neuen Widgets. Dass ein Drehregler noch kein Drehregler ist, ist ein
  anderer Auftrag — hier geht es allein um die Design-Angaben.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktion mit Tests: Design → CSS-Eigenschaften, mindestens je ein Fall
  für `schatten.innen`, `rand.muster`, `rand.radien` gegen `rand.radius`
  (ausführliche Form gewinnt) und `versatz`.
- Handprobe im PR gegen `examples/` — Betreiberdaten gehören nicht ins Repo.
