# AUFTRAG WIDGET-FARBAUSWAHL: Farbe aus einem Bild greifen (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/widget-farbauswahl`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md`, `ui/src/visu/design.ts` (`visuDateiUrl`).
- **Nach dem Regler.** Kleinster der drei Aufträge.

## Warum

Der Betreiber hat einen Farbkreis im Schlafzimmer. Bei uns erscheint er als
Fläche mit Hintergrundbild — das Bild ist inzwischen da und füllt die Fläche,
aber es passiert nichts, wenn man hineintippt.

Das Element ist ein Farbwähler auf Bildbasis: die Farbe unter dem Finger wird
zum Wert. Das Bild kommt aus dem Design (`design.bild`), liegt also schon
richtig — es fehlt nur das Greifen.

## Der Vertrag

```yaml
widget: farbauswahl
parameter:
  modus: rgb          # dimmen | rgb | hsv
  cursor: 24          # Durchmesser des Rings in Pixeln; 0 = kein Ring
  cursor_staerke: 2
  alpha_schwelle: 32  # Pixel mit weniger Deckkraft gelten als „daneben"
bindungen:
  set: eg.licht_farbe
  status: eg.licht_farbe_status
```

Das Bild kommt **nicht** aus den Parametern, sondern aus dem Design des
Elements (`design.bild`). So bleibt es an einer Stelle und wechselt mit einem
zustandsabhängigen Design mit.

## Umfang

1. Bild darstellen und die Farbe unter Zeiger bzw. Finger auslesen.
2. Geschrieben wird beim Loslassen, nicht bei jeder Bewegung — sonst füllt ein
   Wischen den Bus. Während des Ziehens folgt der Ring dem Finger.
3. `modus` bestimmt, was geschrieben wird: `dimmen` die Helligkeit 0…255,
   `rgb`/`hsv` den Farbwert.
4. Pixel unterhalb `alpha_schwelle` sind „daneben": kein Schreiben, kein
   Springen des Rings. Ein Farbkreis ist rund, seine Bildfläche ist eckig — ohne
   diese Regel greift man in die Ecke und bekommt Unsinn.
5. Ohne `set`-Bindung reine Anzeige.

## Nicht-Scope

- `core/**`, `cli/**`, `schema/**`, `importer/**`.
- Kein eigener Farbwähler ohne Bild. Wer keins hinterlegt hat, bekommt die
  Fläche wie bisher.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktion mit Tests: Bildkoordinate → Wert je Modus, und dass ein Pixel
  unter der Alpha-Schwelle **nichts** liefert.
- Handprobe im PR gegen `examples/` mit einem selbst erzeugten Verlaufsbild —
  Betreiberdaten gehören nicht ins Repo.
