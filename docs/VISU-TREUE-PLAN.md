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

Die Abzüge macht `tools/visu-abzug.mjs` (seit 06.10.2026): es steuert einen
Chromium (Chrome oder Edge) über das DevTools-Protokoll, lädt die Seite,
schreibt die berechneten Formangaben als Inline-Stile und sichert das
Dokument. Keine Abhängigkeit — der WebSocket-Client ist in Node 24 eingebaut.

```bash
# Fachwerk, ein Zustand je Aufruf — Werte werden vorher über die API gesetzt
FACHWERK_PASSWORT=... node tools/visu-abzug.mjs \
  "http://localhost:8300/visu.html?seite=licht_eg" abzug/licht_eg_an.html \
  --nutzer julian --setze licht.eg.status=true

# Altanlage: einmal sichtbar anmelden, danach kopflos mit demselben Profil
node tools/visu-abzug.mjs "http://altanlage/..." abzug/alt_licht_eg.html \
  --profil ~/.fachwerk-abzug-profil --sichtbar
```

Damit ist die Handprobe „reagiert die Anzeige auf den Wert" messbar: zwei
Abzüge derselben Seite mit verschiedenen Werten, Vergleich dazwischen. Zeigt
der Vergleich keine Abweichung, hat sich nichts bewegt.

Der Abzug der Altanlage ist gerendertes DOM der eigenen Nutzdaten, kein
Quelltext. Er gehört nach `_ingest/`, nicht ins Repo.

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

## Messung nach Schritt 1

| Stand | Abweichungen |
|---|---:|
| vorher | 68 |
| Grundstil vererbt | 54 |
| Werkzeug: Schriftketten und Entities richtig gelesen | 44 |

Schriftfarbe (10) und Schriftgroesse (8) sind vollstaendig weg. Von den
verbliebenen 44 sind 18 die Schriftfamilie: die Altanlage nennt eine Kette
`EDOMIfont, Lucida Grande, Arial`, deren erstes Glied dem Export nicht beiliegt.
Wir setzen `Arial, Helvetica, sans-serif` — auf einem Mac ist das ein Schritt
daneben, auf Windows dasselbe. Das ist eine **hingenommene** Differenz, keine
offene Aufgabe: die Hausschrift des Altsystems duerfen wir nicht mitliefern.

Bleiben rund 26 echte Abweichungen, im Kern drei Gruppen: die
Schiebeschalter (Eckenradius, Beschriftung), zwei Elemente mit
Fachwerk-Hintergrund statt keinem, und eine verlorene Schriftfarbe.

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

## Abdeckung der Elementtypen

Das Altsystem definiert 30 Elementtypen. Fachwerk bildet fuenf davon ab; der
Rest wird als Beschriftung importiert und im Migrations-Report gezaehlt. Das
klingt nach viel Rueckstand, ist aber keiner — gemessen an einer realen Anlage:

| Typ | Verwendungen |
|---|---:|
| 1 Universalelement | 120 |
| 0 Gruppe (uebersprungen) | 21 |
| 1004 Schiebeschalter | 5 |
| 12 Dimmer, 15 Farbauswahl, 21 Diagramm | je 1 |

**Alles andere kommt nicht vor.** Kamera, Zeitschaltuhr, Notizen, Codeschloss,
Anrufarchiv: beschrieben, aber ungenutzt. Sie zu bauen, bevor jemand sie
braucht, waere Arbeit ins Blaue.

Bemerkenswert ist die andere Zahl: **30 der 120 Universalelemente tragen
Zustandsdesigns** — der Betreiber baut sich seine Schalter selbst aus dem
Universalelement, statt fertige Typen zu nehmen. Das ist der haeufigste
Bedienbaustein der Anlage, und er braucht kein eigenes Widget, sondern
funktionierende Zustandsdesigns. Genau die sind jetzt da.

## Was dieses Verfahren NICHT leistet

Es vergleicht Form, nicht Verhalten. Ob ein Schalter auf eine Wertänderung
reagiert, sieht man im DOM nicht — dafür bleibt die Handprobe: Wert über die
API setzen und nachsehen, ob sich die Darstellung ändert.

Und es vergleicht eine Seite. Zehn Seiten heißen zehn Abzüge; die Ursachen
wiederholen sich aber, deshalb lohnt sich der Aufwand meist nur für eine
repräsentative Seite pro Bauart.
