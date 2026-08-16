# Nachbesserung zum Zustandsschalter

Betrifft `4c083c1`, `6165fe6`, `686de38` auf `auftrag/widget-schiebeschalter`.
**Nicht nach `main` eingezogen** — Befund 1 ist ein Blocker. `main` steht auf
`42fae91`.

Gemessen wurde im Browser an der echten Anlage des Betreibers: gebaute UI,
laufender Dienst, Seite `lichtsteuerung_eg_1`, Werte ueber die neue Vorschau
gesetzt. Nicht gelesen — nachgemessen.

## Was stimmt

Vorweg, damit klar ist, was nicht angefasst werden muss:

- Die Zustandsdesigns schalten korrekt durch. Bei Statuswert 1 steht am Knopf
  `background: rgb(0, 162, 255)` und am Rahmen `border-color: rgb(0, 162, 255)`
  — beides aus dem Zustandsdesign, beides richtig.
- Der Rohwert ist weg. Kein `<strong>1</strong>` mehr an Schaltern ohne
  `format`.
- Die Vorschau bietet am Kuechenschalter genau `1 · 11 · 12` an. Das ist die
  Kernidee des Auftrags, und sie funktioniert.
- Die lokale Betriebsart schreibt nichts, und ohne Scope `operate` gibt es die
  andere gar nicht.
- Alle vier Tore laufen durch.

## Befund 1 — BLOCKER: alle Elemente haben ihre Groesse verloren

`groesseFuerPlacement` liefert `{ w, h }`. In `VisuElementAnsicht` wird das
Ergebnis in das Stilobjekt gespreizt:

```ts
const stil: JSX.CSSProperties = {
  left: placement.x ?? 0,
  top: placement.y ?? 0,
  ...groesseFuerPlacement(element, designs, status, placement),   // -> w:, h:
```

Die CSS-Eigenschaften heissen aber `width` und `height`. Vorher stand dort
genau das. Jetzt landen `w` und `h` im Stil, der Browser kennt sie nicht, und
**kein Element auf keiner Seite bekommt mehr eine Groesse** — alles richtet
sich nach seinem Inhalt.

Gemessen auf `lichtsteuerung_eg_1`: von 13 pruefbaren Elementen stimmt **kein
einziges**.

| soll | ist |
|---|---|
| 300 x 300 | 91 x 141 |
| 208 x 104 | 0 x 30 |
| 500 x 60 | 522 x 70 |
| 183 x 83 (Knopf, Zustand An) | 90 x 86 |
| 211 x 111 (Rahmen) | 102 x 98 |

Das ist keine Feinheit an einem Schalter, das ist die ganze Visu.

Die Behebung ist eine Zeile — `width`/`height` statt `w`/`h`, entweder im
Rueckgabewert der Funktion oder an der Verwendungsstelle. Wichtiger ist, dass
so etwas nicht wieder ungesehen durchgeht: **bitte einen Test, der die
gerechnete Groesse prueft**, nicht nur das Modell. Vier gruene Tore haben
diesen Totalausfall nicht bemerkt, weil keine Pruefung je eine Elementgroesse
angesehen hat. Ein Modelltest auf `groesseFuerPlacement` allein haette auch
nichts gefunden — die Funktion rechnet ja richtig.

## Befund 2 — die Kopfzeile ist zerbrochen

`.visu-kopf` hat drei Spalten (`1fr auto 1fr`, unter 520 px zwei). Die neue
Schaltflaeche „Vorschau" ist das **vierte** Kind. Das Raster schiebt das
letzte Kind damit in eine zweite Zeile, die aus der Kopfzeile fester Hoehe
herausragt und auf die Zeichenflaeche faellt.

Gemessen:

| Breite | Kopfhoehe | Lage von „● live" |
|---|---|---|
| 1100 px | 50 px | `top: 46px` — zweite Zeile |
| schmal (Regel ab 520 px) | 46 px | `top: 66px` — deutlich darunter |

Also: eine Spalte ergaenzen und pruefen, dass die Schaltflaeche auch am
schmalen Panel Platz hat. Unter 520 px ist die Kopfzeile 46 px hoch und das
erste Kind ausgeblendet — dort ist am wenigsten Raum, und genau dort haengt
das Geraet des Betreibers an der Wand.

## Befund 3 — die Vorschau zeigt ihre eigenen Werte nicht an

`VorschauTafel` bekommt `datenpunkte`, also die **echten** Werte. Die
Ueberschreibungen stecken in `vorschauWerte` und fliessen nur ueber
`darstellungsWerte` in die Zeichenflaeche.

Folge: Wer in der Vorschau auf `1` klickt, sieht den Schalter umschalten —
aber in der Tafel steht weiter `status.sr_kue_spots_status · zahl · 0`.
Nachgemessen, genau so. Beim Zahlenfeld ist es schlimmer als kosmetisch: sein
`value` bleibt am echten Wert haengen.

Die Tafel soll dieselbe Sicht bekommen wie die Zeichenflaeche.

## Befund 4 — der aufgeschlagene Pixel ist geraten

```ts
// Die Altanlage zählt den Basispixel nicht im Zuschlag mit.
knopfGroesse: { b: (knopf.groessenzuschlag?.b ?? 0) + 1, … }
```

Das `+ 1` stimmt fuer genau eine Anlage: dort ist `xsize` des Knopfelements 1,
und 1 + 82 ergibt die beobachteten 83 Pixel. `xsize` kann aber jeden Wert
haben. In der Form `zustaende` hat der Knopf ueberhaupt keine eigene
Platzierung mehr — seine Groesse steht vollstaendig im Design. Ein von Hand
geschriebenes `groessenzuschlag: { b: 82 }` ergaebe dann unerklaerliche 83 px.

Bitte den Zuschlag unveraendert nehmen. Dass der Grundpixel aus der Altanlage
mit hineingerechnet werden muss, ist Sache des Importers — das mache ich in
Spur 1, wenn ich die Umwandlung auf `zustaende` baue. Der Renderer soll das
nicht ahnen muessen.

Gleiches gilt fuer `an:` im neuen Zweig: dort steht eine eigene Kette
`status !== false && status !== 0 && …`, waehrend zwei Zeilen darueber
`schiebeschalterIstAn(status)` genau dafuer da ist. Zwei Fassungen derselben
Regel laufen frueher oder spaeter auseinander.

## Befund 5 — aus der Vorschau kommt man nicht zurueck

Die Werteknoepfe entstehen aus `design_je_wert` und `zustaende`. Der
Aus-Zustand steht dort nicht: er ist das Grunddesign. Am Kuechenschalter gibt
es deshalb `1 · 11 · 12`, aber keine `0` — man kann den Schalter einschalten
und nicht wieder aus.

Der Rueckfallwert gehoert dazu. Bei `bool` ist das `false`, bei `zahl` `0`,
bei `text` die leere Zeichenkette — und er gehoert an den Anfang der Reihe,
nicht ans Ende.

## Kleinigkeit

In `visu.css` stehen fuenf neue Regeln fuer die Vorschau in einer einzigen
Zeile hintereinander (`… }.visu-vorschau p, … {`). Die Datei fuehrt eine Regel
je Zeile.

## Abnahme

1. Auf `lichtsteuerung_eg_1` stimmt die gerechnete Groesse jedes Elements mit
   seiner Platzierung ueberein — mit Ausnahme der Elemente, deren
   Zustandsdesign gerade einen anderen Zuschlag traegt.
2. Statuswert 0 -> 1 am Kuechenschalter: der Knopf misst 183 x 83 statt
   83 x 83, gleitend.
3. „● live" steht bei 1100 px und bei 380 px Breite in der Kopfzeile, nicht
   darunter.
4. Ein in der Vorschau gesetzter Wert erscheint auch in der Tafel.
5. Die Werteknoepfe eines Datenpunkts enthalten den Rueckfallwert.
6. Ein Test scheitert, wenn ein Element seine Groesse verliert.
