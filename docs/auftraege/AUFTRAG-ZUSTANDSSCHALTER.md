# Auftrag: der Zustandsschalter — ein Element statt zwei

Spur 2 (Codex), Bereich `ui/**`. Schema und Importer sind fertig und liegen
auf `main` (`6cebf77`).

## Warum

Der Betreiber hat sich in der Altanlage einen Schalter gebaut, den es dort als
Baustein nicht gibt: **zwei uebereinanderliegende Elemente.** Unten ein Rahmen
(211 x 111, 6 px Rand, Radius 55), darueber ein Knopf (83 x 83, Kreis). Beide
haengen am selben Status-KO, beide haben Zustandsdesigns, und aus dem
Zusammenspiel entsteht ein Schiebeschalter. Sein Satz dazu:

> Grundsaetzlich habe ich 2 Visuelemente verwendet um dieses Design zu
> realisieren, aber ich haette eigentlich gern nur 1 Button, der dieses
> Verhalten zeigt. Leider liess das EDOMI nicht zu.

Das ist keine Marotte. Es ist reine Zustandsgestaltung — Rahmen und Knopf sind
je ein Design pro Wert, sonst nichts. Ein Bedienelement, das das von sich aus
kann, deckt zugleich den eingebauten Schiebeschalter der Altanlage ab. Das ist
der Auftrag.

**Zwei unabhaengige Haelften.** Teil A macht seine importierte Seite richtig —
sie bleibt bei zwei Elementen und muss nur endlich stimmen. Teil B gibt Fachwerk
den Baustein, den die Altanlage nicht hatte. A ist klein und dringend, B ist
die eigentliche Arbeit. Sie haengen nicht voneinander ab.

---

## Teil A — was heute falsch aussieht

Der DOM aus Fachwerk, Zustand An (Statuswert 1), beide Elemente:

```html
<button … style="left:60px; top:1159px; width:83px;  height:83px;  z-index:100;
   background:rgb(87,84,94); border-radius:41px; translate:14px 14px; …">
   <span>ON</span><strong>1</strong></button>
<button … style="left:60px; top:1159px; width:211px; height:111px; z-index:99;
   border:6px solid rgb(0,162,255); border-radius:55px; …">
   <span>ON</span><strong>1</strong></button>
```

### A1 — `groessenzuschlag` anwenden

`VisuDesign` hat ein neues Feld:

```ts
groessenzuschlag?: { b?: number; h?: number };
```

Die Altanlage laesst ein Zustandsdesign die **Ausdehnung** aendern, nicht nur
die Farbe. Genau daran haengt dieser Schalter: der Knopf waechst im Zustand An
von 83 auf 183 Pixel und fuellt den Rahmen aus. Im Import steht das jetzt so:

```yaml
d13: { hintergrund: "#57545e",     groessenzuschlag: { b: 82,  h: 82 } }   # Aus
d14: { hintergrund: rgb(0,162,255), groessenzuschlag: { b: 182, h: 82 } }  # An
```

**Rechenregel.** Die Platzierung enthaelt bereits den Zuschlag des
*Grunddesigns* — `w: 83` ist `xsize 1 + s5 82`. Wirksam ist deshalb die
Differenz:

```
Breite = placement.w - grunddesign.groessenzuschlag.b + aktivesDesign.groessenzuschlag.b
```

Fehlt ein Zuschlag, zaehlt er als 0. Solange dasselbe Design gilt, ist die
Differenz null und nichts aendert sich — bestehende Seiten bleiben unberuehrt.

Die Groesse gehoert in denselben Uebergang wie Farbe und Rand, damit der Knopf
waechst statt zu springen.

### A2 — der Rohwert gehoert da nicht hin

Beide Elemente zeigen `<strong>1</strong>`. Das ist der Rohwert des Status-KO,
und in der Altanlage steht er nirgends. Sichtbar ist dort nur die Beschriftung:
`OFF` bzw. `ON` — im Import als `text` am Element und `beschriftung` im Design.

Regel: **den Wert nur anzeigen, wenn die Beschriftung ihn anfordert.** Der
Importer setzt dafuer bereits `format` mit Praefix/Suffix, wenn der Text der
Altanlage den Platzhalter `{#}` enthaelt. Ohne `format` darf kein Wert
gerendert werden. Das betrifft `preset: schalter`, `taster` und
`statusanzeige`; `wertanzeige` zeigt naturgemaess weiter den Wert.

### A3 — Rand und Schatten am rahmenlosen Element

Das Rahmenelement hat `data-kachel="false"` (kein eigener Hintergrund) und
traegt trotzdem `border: 6px solid` und einen Leuchtschatten. Beides kommt aus
dem Design und ist korrekt gerendert — bitte beim Aufraeumen von A1/A2 nicht
verlieren. Die Kachel-Regel in `visu.css` darf Design-Angaben nie uebermalen.

---

## Teil B — der Zustandsschalter als eigener Baustein

### Was er koennen muss

Ein Element. Ein Status-Datenpunkt. Eine Liste von Zustaenden. Jeder Zustand
beschreibt zwei Flaechen — **Rahmen** und **Knopf** — als je ein Design. Beim
Wechsel wird zwischen beiden Zustaenden ueberblendet, in beide Richtungen.

Das deckt drei Dinge mit einer Sache ab:

| heute | danach |
|---|---|
| der eingebaute Schiebeschalter der Altanlage (controltyp 1004) | zwei Zustaende, Knopf rutscht |
| der handgebaute Schalter aus zwei Elementen | drei Zustaende, Knopf waechst |
| jede kuenftige Zustandsanzeige mit bewegtem Teil | beliebig viele Zustaende |

### Form

```yaml
schalter_kueche:
  widget: schiebeschalter
  bindungen:
    status: status.sr_kue_spots_status
    set: schieberegler.sr_kue_spots_click
  parameter:
    zustaende:
      - wenn: 0   # Rueckfall, wenn kein anderer Zustand trifft
        rahmen: d15
        knopf: d13
      - wenn: 1
        rahmen: d16
        knopf: d14
      - wenn: 11
        rahmen: d17
        knopf: d14
    dauer_ms: 200
    text_im_knopf: true
  aktionen:
    kurz: { art: umschalten, status: schieberegler.sr_kue_spots_click }
  placements:
    panel: { x: 60, y: 1159, w: 211, h: 111 }
```

- **`rahmen`** ist das aeussere Design; es fuellt die Platzierung.
- **`knopf`** ist das innere. Seine Groesse und Lage kommen aus **seinem
  eigenen Design** — `groessenzuschlag` und `versatz`. Der Knopf braucht also
  keine eigenen Parameter fuer Position oder Breite; das Design sagt schon
  alles. Genau deshalb ist die Sache ueberhaupt so klein.
- **`wenn`** vergleicht wie `design_je_wert`: streng, im Typ des
  Datenpunkts. Trifft nichts, gilt der erste Eintrag.
- **`dauer_ms`** gilt fuer den Uebergang von Position, Groesse, Farbe, Rand
  und Schatten des Knopfs *und* des Rahmens.

**Alte Form weiter annehmen.** Der Import des eingebauten Schalters liefert
heute `aus` / `ein` / `knopf_aus` / `knopf_ein` / `ein_liegt` / `form` /
`knopf_anteil`. Der Renderer soll `zustaende` bevorzugen und auf die alte Form
zurueckfallen, wenn sie fehlt. Dann koennen Renderer und Importer unabhaengig
voneinander umgestellt werden, ohne dass zwischendurch etwas kaputt ist. Die
Umstellung des Importers auf `zustaende` mache ich in Spur 1, sobald der
Renderer die neue Form kann — sag Bescheid.

### Bewegung, nicht Sprung

Der springende Punkt (im Wortsinn): heute ist der Knopf ein absolut
positioniertes Kind mit `transition-property: left`. Kuenftig aendern sich
Breite, Hoehe und Versatz gemeinsam. `left`/`width` zu animieren erzwingt
Layout in jedem Bild. Nimm `translate` und `scale` bzw. eine
`transform`-Animation, damit die Bewegung auf dem Panel fluessig bleibt — das
ist ein iPhone im Wandhalter, kein Arbeitsplatzrechner.

`prefers-reduced-motion: reduce` schaltet die Dauer weiterhin auf 0.

### Was NICHT dazugehoert

Kein Wischen mit dem Finger, kein Ziehen des Knopfs. Der Schalter bleibt ein
Taster: Druck loest `aktionen.kurz` aus, die Anzeige folgt dem Status-KO. Die
Altanlage macht es genauso, und alles andere waere eine Bedienung, die der
Betreiber nicht bestellt hat.

---

## Teil C — Visu-Vorschau mit Wertgebern

Der Anlass, woertlich:

> und fuer den Simulator entweder eine Backend-Option einbauen, also KO
> waehlen, Status setzen, oder aehnlich EDOMI eine "Visuvorschau" bei der man
> KOs setzen kann — gern alle, die auf einer Seite vorkommen

Heute geht das nur ueber die Kommandozeile, und um zu sehen, wie ein Schalter
im Zustand An aussieht, muss man am laufenden Haus einen Wert setzen. Das ist
absurd — und gefaehrlich, wenn am KO wirklich eine Lampe haengt.

### Zwei Betriebsarten, und die harmlose ist die Voreinstellung

**1. Vorschau (Standard).** Die Werte werden **nur im Browser** ueberschrieben.
Nichts wird geschrieben, nichts geht auf den Bus, niemandem geht das Licht an.
Die Darstellung rechnet mit dem ueberschriebenen Wert, als kaeme er vom
Dienst. Braucht **keinen** Scope — auch `read` genuegt. Das ist der Modus, in
dem man Designs baut.

**2. Wirklich setzen.** Schreibt ueber `POST /api/datenpunkte/<schluessel>`.
Nur sichtbar mit Scope `operate`, und der Wechsel dorthin muss eine bewusste
Handlung sein, kein Versehen. Solange er aktiv ist, gehoert das deutlich
sichtbar an den Bildschirmrand — wer das vergisst, schaltet beim naechsten
Klick echte Verbraucher.

Gesperrte Datenpunkte (`protected`) tauchen in Betriebsart 2 nicht auf. Sie
sind ueber die API ohnehin nicht schreibbar, mit keinem Scope.

### Was die Tafel zeigt

Alle Datenpunkte, die die **aktuelle Seite** ueber `bindungen` anspricht — aus
dem bereits geladenen Seitenmodell, kein neuer Endpunkt noetig. Je Eintrag:

- Schluessel und Klarname, aktueller Wert, Typ
- ein Wertgeber passend zum Typ: Umschalter fuer `bool`, Feld plus Schieber
  fuer `zahl`, Textfeld fuer `text`
- **die Werte, auf die diese Seite reagiert, als Schaltflaechen.** Alle `wenn`
  aus `design_je_wert` und aus `zustaende` der Elemente, die an diesem
  Datenpunkt haengen, entdoppelt und sortiert.

Der letzte Punkt ist der eigentliche Gewinn. Beim Kuechenschalter waeren das
`0 · 1 · 11 · 12` — genau die vier Werte, die etwas bewirken. Ohne das raet
man, und die feste Stufenfolge des Simulators (`0 1 20 50 100 255`) trifft
`11` und `12` nie.

Erreichbar ueber eine unauffaellige Schaltflaeche in der Kopfzeile; das Panel
im Wandhalter darf davon nichts merken.

---

## Bedingungen

- Nur `ui/**`. Schema, Importer und CLI sind erledigt.
- Vier Tore vor dem Commit: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `bash tools/check-repo.sh`, dazu `pnpm --filter @fachwerk/ui build`.
- Keine fremden Schriften oder Bilder ins Repo (ADR-0015 D-4).
- Beobachtungsmodus bleibt unangetastet: Betriebsart 2 schreibt ueber
  dieselbe API wie jede Bedienung und unterliegt derselben Sperre.
- Commit-Nachrichten auf Deutsch, ohne Backticks.

## Abnahme

1. Kuechenschalter, Statuswert 0 -> 1: der Knopf **waechst** von 83 auf 183
   Pixel und leuchtet blau, der Rahmen wechselt auf blau, beides gleitend.
2. Kein `<strong>` mit dem Rohwert mehr an Schaltern ohne `{#}`.
3. Ein Element mit `parameter.zustaende` verhaelt sich wie die zwei Elemente
   zusammen — gleiche Groessen, gleiche Farben, gleiche Bewegung.
4. Ein Schalter in der alten Form (`aus`/`ein`) sieht unveraendert aus.
5. Die Vorschau setzt Werte, ohne zu schreiben; ein Neuladen der Seite stellt
   den echten Zustand wieder her.
6. Ohne Scope `operate` gibt es die Betriebsart "wirklich setzen" nicht.
