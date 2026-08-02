# AUFTRAG WIDGET-SCHIEBESCHALTER: ein Schalter für beide Bauarten (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/widget-schiebeschalter`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md`, `ui/src/visu/design.ts`, `ui/src/visu/main.tsx`,
  `docs/VISU-TREUE-PLAN.md`.
- **Kann sofort beginnen.** Der Widget-Name steht im Schema; Spur 1 verdrahtet
  parallel den Importer.

## Warum ein Widget statt zweier

In der Anlage des Betreibers gibt es zwei Bauarten von Schiebeschalter:

| Bauart | Anzahl | Wie sie entsteht |
|---|---:|---|
| Custom-Element „Schiebeschalter (designgesteuert)" | 5 | fertiger Elementtyp |
| Von Hand aus Universalelementen gebaut | 30 | zwei Elemente, Design je Zustand |

Beide sind **designgesteuert**: der Zustand bestimmt nicht ein fest verdrahtetes
Aussehen, sondern welches Design gilt. Das ist auch die ausdrückliche Idee des
Betreibers — ein Schalter mit Aus-Design, Ein-Design und einem Übergang
dazwischen deckt beide Fälle ab.

Es wird also **kein** Nachbau eines fremden Elements. Es wird ein Fachwerk-
Widget, das zufällig beides erschlägt.

## Der Vertrag

```yaml
widget: schiebeschalter
parameter:
  aus: d12            # Design im Aus-Zustand (Pflicht)
  ein: d13            # Design im Ein-Zustand (Pflicht)
  knopf_aus: d14      # Design des beweglichen Knopfs, optional
  knopf_ein: d15      # optional
  knopf_anteil: 45    # Breite des Knopfs in Prozent der Schalterbreite
  dauer_ms: 200       # Dauer des Uebergangs; 0 = ohne
  ein_liegt: rechts   # wo der Knopf im Ein-Zustand steht: links | rechts
bindungen:
  status: eg.licht_status
  set: eg.licht_schalten
aktionen:
  kurz: { art: umschalten }
```

- Der Zustand kommt aus `bindungen.status`; „an" ist alles ausser `0`, `false`,
  leer und nicht auswertbar — dieselbe Regel wie beim Umschalten (`bedienen.ts`).
- Fehlt `knopf_aus`/`knopf_ein`, wird **kein** Knopf gezeichnet; der Schalter
  ist dann eine Fläche, die ihr Design wechselt. Das ist der Eigenbau-Fall.
- Beschriftung: der Text des Elements bzw. die `beschriftung` des geltenden
  Designs, wie bei jedem anderen Element auch.

## Umfang

1. Widget zeichnen: Fläche im Design des Zustands, optional darin ein Knopf,
   der beim Wechsel von einer Seite zur anderen **wandert**.
2. Der Übergang läuft über `dauer_ms`. `0` und fehlende Angabe heissen: sofort.
   Wer `prefers-reduced-motion` gesetzt hat, bekommt keinen Übergang — das ist
   keine Kür, sondern Barrierefreiheit.
3. Klick löst die hinterlegte Aktion aus; ohne `set`-Bindung ist der Schalter
   reine Anzeige und darf nicht klickbar wirken.
4. Rückmeldung beim Drücken wie bei den anderen Elementen (Deckkraft), damit
   ein Tastendruck auf dem Panel quittiert.

## Nicht-Scope

- `core/**`, `cli/**`, `schema/**`, `importer/**`. Der Widget-Name steht schon
  im Schema; Spur 1 füllt die Parameter aus dem Import.
- Kein Nachbau der Optik eines bestimmten fremden Elements. Wie es aussieht,
  sagen ausschliesslich die übergebenen Designs.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktion mit Tests: Zustand → geltendes Design und Knopfposition,
  mindestens (a) aus, (b) an, (c) Zahlenwert ungleich 0 gilt als an,
  (d) ohne Knopf-Designs kein Knopf, (e) `ein_liegt: links` spiegelt.
- Handprobe im PR gegen ein Beispiel-Gewerk in `examples/`.
