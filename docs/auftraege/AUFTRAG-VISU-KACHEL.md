# Auftrag: keine Standard-Kachel auf importierten Seiten

Spur 2 (Codex), Bereich `ui/**`. Branch `auftrag/visu-kachel`, Basis
`origin/main`. Schema und Importer sind fertig (Spur 1); `main` trägt das
Feld bereits.

Grundlage ist die Messung vom 06.10.2026 (`docs/VISU-TREUE-PLAN.md`,
Abschnitt „Messung 06.10.2026"): zwei DOM-Abzüge je Seite, Altanlage gegen
Fachwerk, verglichen mit `tools/visu-vergleich.mjs`. Die Zahlen unten sind
daraus abgelesen.

## Der Befund

Von 67 Abweichungen auf den Seiten „Lichtsteuerung EG 1" und
„Jalousie-Steuerung Seite 1" haben **36 dieselbe Ursache**: Hintergrund,
Rahmen 1 px, Eckenradius 12 px und Schatten auf Elementen, die im Original
nichts davon haben. So sieht eine Wertanzeige heute bei uns aus:

```html
<div class="visu-element" data-preset="wertanzeige" data-kachel="true"
  style="left:602px; top:275px; width:70px; height:50px;
         color:rgb(187,187,187); font-size:25px; font-style:italic; text-align:right;
         background:rgb(23,28,34); border-width:1px; border-radius:12px;
         box-shadow: …">
```

Und so in der Altanlage, dasselbe Element:

```
left:602px; top:275px; width:70px; height:50px;
font-size:25px; font-style:italic; text-align:right; color:rgb(187,187,187)
```

Kein Hintergrund, kein Rahmen, kein Radius, kein Schatten. Es ist Text auf
der Seite.

Die Ursache steht in `ui/src/visu/modell.ts`, `fachwerkKachelFuer`: ein
Element, dessen Design keine Fläche definiert, bekommt die Kachel der
Fachwerk-Oberfläche, sofern sein Preset nicht in
`PRESETS_OHNE_STANDARD_KACHEL` steht. Für Fachwerk-eigene Seiten ist das
richtig (so sehen die Beispiele aus). Für importierte Seiten ist es falsch:
das Altsystem kennt keine Kachel, und der Importer kann „keine Fläche" nicht
ausdrücken, weil das Fehlen aller Flächenangaben genau das Signal für die
Kachel ist.

## Der Vertrag (liegt auf main)

`VisuGrundstil` hat ein neues Feld (`schema/src/visu.ts`):

```ts
/** Standard-Kachel fuer Elemente ohne eigene Flaeche? Fehlt: true. */
kachel?: boolean;
```

Der Importer schreibt `kachel: false` in den `grundstil` jeder importierten
Seite. Fachwerk-eigene Seiten ohne die Angabe verhalten sich wie bisher.

## Aufgabe

**A — die Regel auswerten.** `fachwerkKachelFuer` bekommt den Grundstil der
Seite dazu (oder nur das Flag) und liefert `false`, wenn `kachel === false`.
Die bisherige Logik (eigene Fläche im Design, Preset-Liste) bleibt für
`kachel !== false` unverändert.

Welcher Grundstil zählt: der der Seite, auf der das Element **definiert** ist.
Bei Include-Seiten (Kopfbereich) also der Grundstil der Include-Seite, nicht
der der einbindenden Seite — `grundstilFuerRenderSeite` in
`ui/src/visu/design.ts` löst das für die Typografie schon so auf; die
Kachel-Entscheidung soll derselben Auflösung folgen.

**B — nichts anderes ändert sich.** Ein Element, dessen Design eine Fläche
definiert (Hintergrund, Rand, Schatten, Polsterung, Bild), sieht mit und ohne
Flag gleich aus: es zeichnet seine eigene Fläche. Das Flag betrifft nur die
Fachwerk-Kachel, die an die Stelle einer fehlenden Fläche tritt.

**C — Editor, nur wenn schon vorhanden.** Bearbeitet der Visu-Editor den
Seiten-Grundstil bereits als Formular, kommt ein Schalter „Standard-Kachel
für Elemente ohne Fläche" dazu. Tut er es nicht, bleibt das für einen eigenen
Auftrag; hier nicht nachrüsten.

## Bedingungen

- Nur `ui/**`.
- Vier Tore vor dem Commit, dazu `pnpm --filter @fachwerk/ui build`.
- Commit-Nachrichten auf Deutsch, ohne Backticks.
- Keine neuen Abhängigkeiten.

## Abnahme

1. Test in `ui/src/visu/modell.test.ts`: Wertanzeige ohne Flächenangaben,
   Grundstil `kachel: false` → keine Kachel; derselbe Fall ohne das Flag →
   Kachel; Element mit eigenem Hintergrund → in beiden Fällen keine
   Standard-Kachel (es hat ja eine eigene Fläche).
2. Test für Include-Seiten: Element einer Include-Seite mit `kachel: false`
   bleibt kachellos, auch wenn die einbindende Seite das Flag nicht setzt.
3. `examples/minimal` sieht unverändert aus (kein Flag, also Kachel).
4. Messung im PR: `tools/visu-abzug.mjs` auf eine importierte Seite,
   `tools/visu-vergleich.mjs` gegen den Abzug der Altanlage — die Gruppen
   Hintergrund, Rahmenbreite, Schatten, Eckenradius müssen auf der
   Jalousie-Seite von 8/8/8/7 auf null fallen. Spur 1 stellt dafür den
   Fachwerk-Abzug und die Abweichungsliste bereit; den Abzug der Altanlage
   bekommt Spur 2 nicht (liegt in `_ingest/`), er ist für die Messung auch
   nicht nötig — die Zahlen stehen in der Liste.
