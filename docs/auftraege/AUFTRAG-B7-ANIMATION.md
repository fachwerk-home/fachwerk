# AUFTRAG B7-ANIMATION: Weiche Übergänge in der Visu (zweiteilig, klein)

Backlog B-7 — der Betreiber hat animierte Schalter im Altsystem vergeblich
versucht; hier sind sie fast geschenkt, weil `design_je_wert` ohnehin
CSS-Klassen wechselt. Bewusst klein geschnitten; KEINE Voraussetzung für den
Start-Abschluss (nice-to-have, nach den laufenden Visu-Paketen).

## Teil 1 — Spur 1/Opus (Schema, winzig)

Design-Vorlage (designs.yaml) bekommt optionales Feld
`uebergang: { dauer_ms: <int 0..2000>, kurve?: "linear"|"ease"|"ease-in-out" }`
(Default kurve ease). Schema + Typ + kanonische Reihenfolge + Doku-Satz in
SPEC-003. Kein Laufzeitcode.

## Teil 2 — Codex (`ui/**`, Branch `auftrag/b7-animation`, nach Teil 1)

1. Renderer: hat das effektive Design einen `uebergang`, bekommen die
   animierbaren Eigenschaften (Hintergrund, Textfarbe, Rand, Transform,
   Opazität) eine entsprechende CSS-Transition — Zustandswechsel über
   `design_je_wert` gleiten statt zu springen. Slider-Knopf und
   Schalter-Toggle nutzen denselben Übergang.
2. **`prefers-reduced-motion: reduce` gewinnt immer** (Übergänge aus).
3. Editor: die zwei Felder unter „Erweitert" im Design-Bereich.
4. Keine Endlos-/Keyframe-Animationen in v1 (kein Blinken — bewusst).

## Abnahme

Gates + UI-Build grün · GIF im PR: Schalter gleitet bei Wertwechsel,
reduced-motion schaltet es ab · Roundtrip-Test mit uebergang-Feld diff-frei.
