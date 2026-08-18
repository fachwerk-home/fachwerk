# Auftrag: der Drehregler kippt jenseits einer halben Umdrehung

Spur 2 (Codex), Bereich `ui/**`. Klein, aber es ist der einzige Punkt, der den
Dimmer des Betreibers unbrauchbar macht. `main` steht auf `855bd97`.

## Der Befund

`reglerWertFuerGeste` berechnet die Winkeldifferenz bei **jeder** Zeigerbewegung
neu gegen den Winkel beim Aufsetzen, und `winkelDifferenz` normalisiert das
Ergebnis auf ±180 Grad. Über eine halbe Umdrehung hinaus wird die Differenz
deshalb negativ, und der fortgeschriebene Wert fällt unter die Untergrenze.

Nachgemessen an den Modellfunktionen, Dimmer des Betreibers
(`art: poti_relativ`, 0 bis 255, voller Kreis, Startwert 0):

| Drehung | Fachwerk | Altanlage |
|---:|---:|---:|
| 90° | 64 | 64 |
| 179° | 127 | 127 |
| **181°** | **0** | 128 |
| **270°** | **0** | 191 |

Bis zur Hälfte stimmt es auf die Einheit. Einen Hauch weiter, und das Licht
geht aus statt heller zu werden. Am Wandpanel ist das die naheliegendste Geste
überhaupt: einmal herumdrehen.

Dasselbe gilt für `inkrement` — dort kippt die Schrittzahl ins Negative.

## Was zu ändern ist

Die Differenz muss **fortlaufend** aufsummiert werden statt bei jeder Bewegung
neu gegen den Aufsetzwinkel gerechnet: je Zeigerbewegung die Differenz zum
**vorherigen** Winkel bilden (dort ist die ±180-Normalisierung richtig und
nötig, sie fängt den Nulldurchgang ab) und auf die bisherige Summe addieren.

Damit wird aus der Normalisierung das, wofür sie gedacht ist — ein Schutz gegen
den Sprung von 359 auf 0 —, statt einer Obergrenze für die ganze Geste.

Der laufende Zustand einer Geste liegt heute in `dataset` am SVG
(`reglerStartwert`, `reglerStartwinkel`). Ein dritter Eintrag für den zuletzt
gesehenen Winkel passt dort dazu; ob du stattdessen die aufgelaufene Summe
führst, ist deine Entscheidung.

`art: "poti"` bleibt unberührt: dort ist die Zeigerlage der Wert, ohne
Differenzrechnung.

## Bedingungen

- Nur `ui/**`.
- Vier Tore vor dem Commit, dazu `pnpm --filter @fachwerk/ui build`.
- Commit-Nachrichten auf Deutsch, ohne Backticks.

## Abnahme

1. `poti_relativ`, 0 bis 255, voller Kreis, Startwert 0: 181° ergibt 128,
   270° ergibt 191, 359° ergibt 254.
2. Rückwärts drehen verringert; unter die Untergrenze wird geklemmt, nicht
   umgebrochen.
3. Der Nulldurchgang (359° auf 1°) erzeugt keinen Sprung.
4. `inkrement` mit `schritt_winkel: 15`: 40° ergibt 2 Schritte, 400° ergibt 26.
5. `poti` verhält sich unverändert.
6. Ein Test deckt Punkt 1 und Punkt 3 ab.
