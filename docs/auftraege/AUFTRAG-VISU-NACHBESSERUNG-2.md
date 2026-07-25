# AUFTRAG VISU-NACHBESSERUNG-2: Icon-Optik & Textausrichtung (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/visu-nachbesserung-2`, zwingend von `origin/main`.
- **Herkunft:** Betreiber-Sichtprüfung des importierten Panels am DEV-System.
  Drei Renderer-Befunde; die Importer-/Schema-Seite (Textausrichtung als
  Design-Feld) liegt schon auf main.
- **Pflichtlektüre:** `AGENTS.md`, `schema/src/visu.ts`
  (`VisuDesign.textausrichtung`), `ui/src/visu/main.tsx` (`designStil`).

## Die drei Befunde (aus den echten Daten belegt)

**1. Icon-Buttons tragen einen grauen Kasten, den es im Original nicht gibt.**
Die Rollladen-Symbole sind `taster` ohne Design-Hintergrund (im Export kein
`s9`). Den grauen Kasten macht Fachwerks CSS-Default für interaktive Presets.
A3 hat das für `label` gelöst (kein Standard-Kachel). Ziehe dieselbe Linie
weiter: **Hintergrund, Rand und Schatten kommen aus dem Design, nicht aus
einem Preset-Default.** Ein `taster`/`schalter` OHNE `design.hintergrund` und
OHNE `design.rand` rendert ohne Kachel (nur der Klickbereich bleibt, für
:hover/:active-Rückmeldung genügt ein dezenter Effekt statt einer Dauer-Kachel).
Ein Element MIT Design-Hintergrund/Rand zeigt diese weiterhin.

**2. Icons sind zu groß für ihre Box und werden abgeschnitten.**
Beispiel Rollladen-Auf: `schriftgroesse` 100 px in einem 50 px hohen Element.
Das ist in EDOMI so gewollt — der Glyph ragt über seine Box hinaus und bleibt
trotzdem sichtbar. Fachwerks `.visu-element { overflow: hidden }` clippt ihn.
Lösung: Elemente, deren Inhalt ein einzelnes Symbol ist (Text ist genau EIN
Zeichen aus der Private-Use-Area U+E000–U+F8FF), dürfen überlaufen —
`overflow: visible` und keine erzwungene `line-height`, die den Glyph
vertikal beschneidet. Für normalen Text bleibt `overflow: hidden` (Ellipsis).

**3. Beschriftungen stehen kreuz und quer statt linksbündig.**
Ursache war importseitig (Textausrichtung wurde verworfen) — behoben: das
Design trägt jetzt optional `textausrichtung: "links" | "zentriert" | "rechts"
| "blocksatz"`, der Importer füllt es aus EDOMIs Slot s18. **Links ist der
Default** (EDOMI wie Fachwerk); nur Abweichungen stehen im Design.
Der Renderer muss: (a) `text-align` standardmäßig `left` setzen (heute wird
zentriert), (b) `design.textausrichtung` anwenden, wenn gesetzt. In
`designStil` analog zu den übrigen Design-Feldern (`links→left`,
`zentriert→center`, `rechts→right`, `blocksatz→justify`).

## Nicht-Scope

- Keine Änderung an Werten/Positionen im Gewerk oder am Importer/Schema.
- **Seiten-„Springen"** (uneinheitliche Seitenhöhe) ist NICHT hier — das ist
  ein Importer-Thema und wartet auf einen DOM-Vergleich des Betreibers.
- Kein eigener Icon-Satz (B-9).

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktion für „ist der Inhalt ein einzelnes Symbol?" mit Test.
- `designStil`-Erweiterung um `textausrichtung` mit Test (jede der vier
  Ausrichtungen → korrekter `text-align`-Wert; ohne Feld → `left`).
- Handprobe im PR: eine importierte Seite — Icons ohne grauen Kasten und
  vollständig sichtbar, Beschriftungen linksbündig untereinander.
