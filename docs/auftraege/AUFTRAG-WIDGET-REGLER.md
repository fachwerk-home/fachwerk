# AUFTRAG WIDGET-REGLER: Drehregler und Dimmer als ein Widget (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/widget-regler`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md`, `ui/src/visu/bedienen.ts`,
  `ui/src/visu/design.ts`.
- **Nach dem Schiebeschalter.** Beide fassen dieselben Dateien an; nacheinander
  spart einen Konflikt.

## Warum ein Widget für zwei Elementtypen

Das Altsystem kennt zwei Drehbedienungen, die sich nur in der Belegung
unterscheiden:

| Typ | Name | Bedienung |
|---|---|---|
| 11 | Drehregler | Zahlenwert am Kreis |
| 12 | Dimmer/RGB/HSV | derselbe Kreis, dazu Ein/Aus und Farbkanäle |

Getrennt gebaut wären das zwei Widgets mit demselben Kern. Zusammen ist es
eines mit einem Betriebsmodus. Beim Betreiber kommt Typ 12 genau **einmal** vor
— es lohnt sich nur, wenn man beide auf einmal erschlägt.

Aktuell wird beides als Beschriftung mit rohem Zahlenwert gezeichnet: ein
leeres Quadrat mit `24.705882352941178` darin.

## Der Vertrag

```yaml
widget: regler
parameter:
  modus: wert         # wert | dimmer | rgb | hsv
  art: poti           # poti (absolut) | inkrement (relativ)
  min: 0
  max: 255
  schritt: 1
  groesse: 90         # Durchmesser in Prozent der Elementflaeche
  knopf_anteil: 70    # Knopfgroesse in Prozent des Durchmessers
  winkel_von: 210     # Grad, Nullpunkt oben, im Uhrzeigersinn
  winkel_bis: 510
bindungen:
  status: eg.dimmwert_status
  set: eg.dimmwert
```

- `modus: wert` ist der einfache Drehregler. `dimmer` ergänzt eine Ein/Aus-
  Bedienung, `rgb`/`hsv` zusätzlich die Kanalwahl.
- Fehlt `min`/`max`, gilt 0…255 — der übliche Bereich eines Dimmwerts.
- Fehlt `winkel_von`/`winkel_bis`, gilt ein sinnvoller Standardbogen.

## Umfang

1. Kreisregler zeichnen: Bogen für den Wertebereich, Marke für den aktuellen
   Wert, Knopf in `knopf_anteil`.
2. Bedienen per Ziehen entlang des Bogens. `art: poti` schreibt den absoluten
   Wert, `art: inkrement` die Differenz zur Startposition.
3. **Nicht bei jedem Pixel schreiben.** Während des Ziehens zeigt der Regler
   den Wert lokal an; geschrieben wird beim Loslassen. Sonst füllt eine
   Drehbewegung den Bus mit hunderten Telegrammen.
4. `modus: dimmer` bekommt zusätzlich eine Ein/Aus-Bedienung, `rgb`/`hsv` die
   Kanalwahl. Reicht die Fläche dafür nicht, entfällt die Zusatzbedienung —
   lieber ein sauberer Regler als ein überladener.
5. Ohne `set`-Bindung ist der Regler reine Anzeige.

## Nicht-Scope

- `core/**`, `cli/**`, `schema/**`, `importer/**`.
- Kein Farbverlaufsbild als Hintergrund — das ist die Farbauswahl (Typ 15) und
  hat einen eigenen Auftrag.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktionen mit Tests: Wert → Winkel und Winkel → Wert (beide
  Richtungen, inklusive Randwerte und Bereichsgrenzen); dass ein Wert
  ausserhalb `min`/`max` begrenzt wird statt den Bogen zu verlassen.
- Handprobe im PR gegen `examples/`: ziehen, loslassen, Wert steht.
