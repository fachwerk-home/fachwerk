# Auftrag: Form des Standard-Schiebeschalters und die Tasten am Drehregler

Spur 2 (Codex), Bereich `ui/**`. Importer ist fertig, `main` steht auf
`62eeb3b`.

Grundlage sind zwei DOM-Abzüge derselben Seite: Altanlage und Fachwerk, beide
vom Betreiber, beide im selben Zustand. Die Zahlen unten sind daraus
abgelesen, nicht geschätzt.

## A — der eingebaute Schiebeschalter ist eckig, leer und farblos

So sieht ein Schalter (controltyp 1004) heute bei uns aus:

```html
<button class="visu-element" data-preset="schiebeschalter"
  style="left:63px; top:1447px; width:208px; height:104px;
         background:linear-gradient(rgb(237,237,237) 5%, rgb(186,177,186) 100%);
         color:rgb(85,85,85); font-size:28px;">
  <span class="schiebeschalter-knopf"
        style="width:45%; transform:translateX(0%); …"></span>
</button>
```

Und so in der Altanlage — Rahmen und Knopf:

| | Altanlage | Fachwerk |
|---|---|---|
| Rahmen-Eckenradius | **52px** (= halbe Höhe, eine Pille) | keiner, rechteckig |
| Knopf | **100 × 100 px, `border-radius: 50px`** — ein Kreis | 45 % breit, keine Höhe, kein Radius |
| Knopf-Rand | 2px oben und unten, `left: 106px` | am Rand klebend |
| Knopftext | **`Aus`**, `line-height: 100px`, zentriert | keiner |

Drei Dinge sind zu tun.

**A1 — `form: pille` auswerten.** Der Importer schreibt diesen Parameter seit
dem 1004-Paket; im Renderer kommt der Name nirgends vor, geprüft über den
ganzen Baum. Das ist derselbe Fall wie `text_im_knopf` neulich. `pille` heißt:
Eckenradius = halbe Elementhöhe, und der Knopf ist ein Kreis mit
`border-radius: 50%`.

**A2 — der Knopf ist quadratisch, nicht prozentual breit.** Sein Durchmesser
ist die Höhe des Rahmens abzüglich eines schmalen Rands (in der Altanlage
104 − 4 = 100), und er sitzt mit demselben Abstand am Rand. `knopf_anteil`
bleibt für andere Formen gültig; bei `form: pille` bestimmt die Höhe.

**A3 — der Knopftext fehlt.** Die An/Aus-Zeile steht im Element unter
`format.bool_map`, nicht in `element.text` — deshalb greift die
`text_im_knopf`-Regel von neulich ins Leere und blendet obendrein den
Rahmentext aus. Ergebnis: gar keine Beschriftung mehr, der Betreiber hat es
gemeldet („An Text am Play Button ist weg"). `schiebeschalterKnopfBeschriftung`
soll als letzten Rückfall den **formatierten Wert** nehmen, also das, was
`elementAnzeige` aus `bool_map` macht. Reihenfolge: Beschriftung des
Knopfdesigns, dann Elementtext, dann formatierter Wert.

## B — die Tasten für 0 % und 100 % am Drehregler

Die Altanlage zeichnet neben dem Rad zwei Flächen, links Aus, rechts Ein:

```
td#e-192-off   width:50%   +  div#e-192-offcaption
td#e-192-on    width:50%   +  div#e-192-oncaption
div#e-192-wheel0   left:15px top:15px  270×270  border-radius:100%
```

Beim Betreiber steht `var3=3` und beide Tasten sind sichtbar. Der Importer
liefert dafür künftig `tasten: { aus: 0, ein: 255 }`; fehlt der Parameter,
gibt es keine Tasten. **Ich ergänze das im Importer, sobald du sagst, dass der
Renderer die Form annimmt** — sag mir, ob dir ein anderer Zuschnitt lieber ist.

Was `var3` außer 3 bedeuten kann, ist nicht belegt. Die geprüfte Spec sagt nur,
dass die Tasten „sofern eingeschaltet" erscheinen, ohne Werteliste. Deshalb
wird nichts geraten: der Importer setzt die Tasten nur bei dem Wert, den wir am
Abzug gesehen haben, und meldet jeden anderen.

## C — die Radgröße kommt jetzt in Pixeln

`groesse` war bislang der rohe Wert aus der Altanlage und wurde von mir
fälschlich als Pixelzahl beschrieben. Es ist ein Prozentsatz; der Importer
rechnet ihn seit `62eeb3b` in Pixel um (beim Betreiber: 90 % von 300 = 270).
Am Renderer ändert sich dadurch nichts — `min(90%, var(--regler-groesse))`
liefert dann die 270. Diese Zeile steht nur hier, damit die Zahl nicht ein
zweites Mal umgerechnet wird.

## Bedingungen

- Nur `ui/**`.
- Vier Tore vor dem Commit, dazu `pnpm --filter @fachwerk/ui build`.
- Commit-Nachrichten auf Deutsch, ohne Backticks.

## Abnahme

1. Ein Schalter mit `form: pille`: Rahmen mit Radius halbe Höhe, Knopf als
   Kreis mit Durchmesser Höhe minus Rand.
2. Der Knopf trägt `An` bzw. `Aus` aus `bool_map`, zentriert.
3. Ohne `form: pille` sieht ein Schalter aus wie bisher.
4. Ein Regler mit `tasten` zeigt zwei Flächen, die 0 und 255 schreiben; ohne
   den Parameter keine.
5. Tests für A1 bis A3.
