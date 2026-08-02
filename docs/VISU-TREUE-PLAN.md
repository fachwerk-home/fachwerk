# Visu-Treue: messen statt schauen

## Das Problem mit dem bisherigen Vorgehen

Der Betreiber sieht sich die importierte Visu an, nennt drei Auffälligkeiten,
ich behebe zwei davon, er sieht sich das Ergebnis an, nennt drei neue. Nach
mehreren Runden ist unklar, ob es besser wird — und es fühlt sich an, als
müsste jedes einzelne Element von Hand angefasst werden.

Die Ursache ist nicht Nachlässigkeit, sondern das Verfahren: **eine Seite hat
128 Elemente.** Wer zwei Bildschirme nebeneinanderlegt, findet drei
Abweichungen und übersieht dreißig. Wer einen DOM-Abzug vorgelegt bekommt,
liest einen Ausschnitt. Beides skaliert nicht.

## Das Verfahren

`tools/visu-vergleich.mjs` vergleicht zwei DOM-Abzüge Element für Element und
listet **alle** Abweichungen, nach Häufigkeit geordnet:

```bash
node tools/visu-vergleich.mjs alt.html neu.html [--alle]
```

Die Reihenfolge ist der ganze Trick. Eine Abweichung, die 28-mal auftritt, hat
**eine** Ursache — nicht 28. Man behebt sie einmal und misst nach.

Abzug der Altanlage: Seite im Browser speichern. Abzug aus Fachwerk: Seite
öffnen, in den Entwicklerwerkzeugen die berechneten Formangaben in die
Inline-Stile schreiben und `document.querySelector('.canvas').outerHTML`
sichern.

Beim Vergleich sind Scheinunterschiede der Feind: `border-radius: 0px` gegen
eine fehlende Angabe ist keine Abweichung, `-webkit-linear-gradient(-90deg,…)`
gegen `linear-gradient(…)` auch nicht. Das Werkzeug normalisiert beides. Ein
Werkzeug, das Artefakte meldet, ist schlimmer als keins — man arbeitet dann an
Dingen, die schon stimmen.

## Befund (Lichtsteuerung EG 1, 28 zugeordnete Elemente)

| Abweichung | Anzahl | Ursache |
|---|---:|---|
| Schriftart | 28 | Voreinstellung der Altanlage wird nicht übernommen |
| Schriftfarbe | 10 | dieselbe Ursache |
| Schriftgröße | 8 | dieselbe Ursache |
| Rest | 22 | Einzelfälle, siehe unten |

**46 von 68 Abweichungen sind eine einzige Ursache.** Die Altanlage gibt ihren
Seiten Voreinstellungen mit — Schrift, Größe 10 px, Textfarbe Schwarz — und
jedes Element ohne eigene Angabe erbt sie. Fachwerk setzt stattdessen die
Voreinstellungen seiner eigenen Oberfläche ein (Inter, 14 px, helles Grau).
Deshalb sehen genau die Elemente falsch aus, die im Original **nichts** eigenes
mitbringen: die schlichten Standard-Schalter.

Das ist der Grund, warum es sich anfühlt wie „jedes Element einzeln". Es ist
ein Fehler, der 46-mal sichtbar wird.

## Reihenfolge

1. **Seiten-Voreinstellungen übernehmen** (Spur 1: Schema + Importer,
   Spur 2: Renderer). Eine Seite bekommt Schrift, Schriftgröße und Textfarbe
   als Vorgabe; Elemente erben sie, statt die Fachwerk-Oberfläche zu erben.
   Erwartete Wirkung: 46 Abweichungen weg.
2. **Nachmessen.** Erst dann steht fest, was übrig bleibt.
3. **Fehlende und überzählige Elemente** klären — aktuell fehlen 3, eines ist
   zu viel.
4. **Widgets** für Drehregler (controltyp 11/12), Schieberegler (13) und den
   Schiebeschalter (1004). Das sind die einzigen Posten, die wirklich
   Element für Element gebaut werden müssen — vier Typen, nicht 128 Elemente.
   `_ingest/controltypen.md` liefert dafür die var-Belegung.

## Was dieses Verfahren NICHT leistet

Es vergleicht Form, nicht Verhalten. Ob ein Schalter auf eine Wertänderung
reagiert, sieht man im DOM nicht — dafür bleibt die Handprobe: Wert über die
API setzen und nachsehen, ob sich die Darstellung ändert.

Und es vergleicht eine Seite. Zehn Seiten heißen zehn Abzüge; die Ursachen
wiederholen sich aber, deshalb lohnt sich der Aufwand meist nur für eine
repräsentative Seite pro Bauart.
