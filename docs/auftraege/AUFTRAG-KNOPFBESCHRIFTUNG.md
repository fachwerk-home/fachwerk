# Auftrag: Beschriftung im Schalterknopf

Spur 2 (Codex), Bereich `ui/**`. Klein — eine Handvoll Zeilen plus Tests.
Schema und Importer sind fertig, `main` steht auf `da3699b`.

## Warum

Der Zustandsschalter ist fertig und stimmt in Maß und Farbe. Eine Abweichung
bleibt, und sie ist die letzte an diesem Element.

In der Altanlage steht die Beschriftung **im Knopf**: schwarz, zentriert auf
der blauen Fläche. Bei uns steht sie daneben — grau (`#57545e`) und
rechtsbündig, weil sie als Beschriftung des Rahmens gerendert wird und die
Farbe des Rahmendesigns erbt. Nachgemessen an der Anlage des Betreibers,
Zustand An:

| | Altanlage | Fachwerk heute |
|---|---|---|
| Text | `ON` | `ON` |
| Farbe | schwarz | `rgb(87, 84, 94)` |
| Ausrichtung | zentriert | rechtsbündig |
| Lage | auf dem Knopf | rechts daneben, teils verdeckt |

Die Angaben sind alle da — sie werden nur nicht gelesen. Das Knopfdesign des
Betreibers trägt `beschriftung: ON`, `text: black` und
`textausrichtung: zentriert`. Der Renderer zeichnet den Knopf-Span leer.

## A — Beschriftung des Knopfdesigns rendern

Hat das aktive Knopfdesign eine `beschriftung`, gehört sie **in** den Knopf,
gestaltet vom Knopfdesign: Farbe, Ausrichtung, Schriftgröße, Schriftschnitt.
Heute bekommt der Span nur `designStil(schalter.knopf)` und bleibt inhaltsleer.

Der Knopf ist kleiner als das Element und hat eigene Polsterung; der Text muss
darin zentriert liegen können, ohne den Knopf zu weiten.

## B — der Knopf gehört nach vorn

Die Beschriftung des Rahmens (`.schiebeschalter-beschriftung`) hat `z-index: 1`
und liegt damit **über** dem Knopf. In der Altanlage ist es umgekehrt: der
Knopf trägt die höhere Ebene und verdeckt den Rahmentext, soweit er ihn
überlappt.

Beides bleibt sichtbar — die Altanlage zeigt in diesem Zustand tatsächlich
zwei Beschriftungen, und der 183 px breite Knopf lässt vom 211 px breiten
Rahmen einen Rand frei. Nur die Reihenfolge muss stimmen. Also: Knopf über
Rahmentext.

## C — `text_im_knopf` ist tot

Der Importer schreibt seit dem 1004-Paket `parameter.text_im_knopf: true`. Im
Renderer kommt der Name **nirgends** vor — geprüft über den ganzen Baum. Der
eingebaute Schiebeschalter der Altanlage zeigt seine An/Aus-Zeile deshalb neben
dem Knopf statt darin.

Zu implementieren: ist `text_im_knopf` gesetzt, wird die Beschriftung des
Elements **im Knopf** gezeichnet statt daneben — nicht zusätzlich, sondern
statt. Ohne das Flag bleibt es wie bisher.

Das ist unabhängig von A: A zeichnet die Beschriftung, die im *Knopfdesign*
steht, C verschiebt die Beschriftung des *Elements* in den Knopf. Der
verschmolzene Schalter des Betreibers nutzt nur A und setzt das Flag nicht —
dort tragen Rahmen und Knopf je eine eigene Beschriftung, genau wie im
Original.

Wenn du C lieber nicht baust, sag Bescheid: dann streiche ich das Flag im
Importer. Ein Parameter, den niemand liest, ist schlimmer als keiner — er
sieht im Gewerk wie eine Zusage aus.

## Bedingungen

- Nur `ui/**`.
- Vier Tore vor dem Commit: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `bash tools/check-repo.sh`, dazu `pnpm --filter @fachwerk/ui build`.
- `prefers-reduced-motion` bleibt unangetastet.
- Commit-Nachrichten auf Deutsch, ohne Backticks.

## Abnahme

1. Küchenschalter im Zustand An: `ON` steht schwarz und zentriert auf der
   blauen Fläche des Knopfs.
2. Der Knopf verdeckt den Rahmentext, soweit er ihn überlappt — nicht
   umgekehrt.
3. Ein Schiebeschalter mit `text_im_knopf` zeigt seine Beschriftung im Knopf
   und nicht daneben.
4. Ein Knopfdesign ohne `beschriftung` erzeugt weiterhin einen leeren Knopf.
5. Ein Test deckt A ab: Knopfdesign mit Beschriftung → Text im Knopf.
