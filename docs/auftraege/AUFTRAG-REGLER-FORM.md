# Auftrag: das Drehregler-Rad ist verzerrt und zu groß

Spur 2 (Codex), Bereich `ui/**`. Branch `auftrag/regler-form`, Basis
`origin/main`. Am Importer ändert sich nichts.

Grundlage ist die Messung vom 06.10.2026 (`docs/VISU-TREUE-PLAN.md`): zwei
DOM-Abzüge der Seite „Lichtsteuerung EG 1", Altanlage gegen Fachwerk, im
Zustand aus. Die Zahlen unten sind daraus abgelesen, nicht geschätzt.

## Der Befund

Das Element ist in beiden Systemen 300 × 300 px bei 63/386. Darin:

| | Altanlage | Fachwerk |
|---|---|---|
| Rad | **270 × 270**, `left:15px; top:15px`, `border-radius:100%` | SVG `regler-kreis` **261 × 240,75** — kein Quadrat |
| Innenfläche | — | `regler-inhalt` 290 × 290 (300 minus 2 × 5 px Rahmen) |
| Tasten Aus/Ein | zwei Zellen zu je 50 % Breite, Beschriftung als `inline-block` mit 2 px Polsterung und 2 px Radius, Polsterung 5 % zum Rand und nach unten | zwei absolut gesetzte Flächen, je 100 × 100 bei 0/2 |

So kommt die Verzerrung zustande (`ui/src/visu/visu.css`):

```css
.regler-inhalt { display: grid; place-items: center; gap: 2px; }
.regler-kreis  { width:  min(90%, var(--regler-groesse, 90px));
                 height: min(90%, var(--regler-groesse, 90px)); }
```

`--regler-groesse` ist 270 (der Importer liefert Pixel). `90 %` gewinnt aber
in beiden Richtungen: 90 % von 290 sind 261 in der Breite, und in der Höhe
bezieht sich das Prozent auf die Grid-Zeile, die durch `gap` und die
Tastenzeile kleiner ist — 240,75. Der Kreis wird eine Ellipse, und die
Marke dreht sich auf einer Bahn, die nicht rund ist.

## Aufgabe

**A — das Rad ist ein Quadrat mit der bestellten Größe.** Das SVG misst
`var(--regler-groesse)` in beiden Richtungen, begrenzt durch die kürzere
Seite der Innenfläche, nie durch eine Grid-Zeile:

```css
.regler-kreis { width: min(var(--regler-groesse, 90px), 100%);
                aspect-ratio: 1 / 1; height: auto; }
```

(oder gleichwertig). Ergebnis beim Betreiber: 270 × 270, zentriert in 290 →
10 px Rand. Das Original hat 15 px Rand in 300, weil es keinen Rahmen am
Element zeichnet — siehe C.

**B — die Tasten liegen wie im Original.** Zwei Flächen je halbe Breite,
links Aus, rechts Ein, Beschriftung am unteren Rand mit 5 % Abstand zum
Seitenrand und nach unten, als kleine Fläche mit 2 px Polsterung und 2 px
Eckenradius. Die Tasten dürfen das Rad nicht verkleinern (heute nehmen sie
der Grid-Zeile Höhe weg). Wer sie als absolute Flächen hinter dem Rad lässt,
muss sie aus dem Grid-Fluss nehmen, damit A nicht wieder kippt.

**C — der 5-px-Rahmen am Element ist zu prüfen, nicht zu raten.** Der
Vergleich meldet `Rahmenbreite: alt undefined, neu 5` am Element 63/386. Ob
das Original einen Rahmen am Rad (nicht am Element) zeichnet, geht aus dem
Abzug nicht hervor — die Stilangabe des Rades ist dort abgeschnitten. Spur 1
klärt das am laufenden Original und ergänzt diesen Auftrag; bis dahin bleibt
der Rahmen, wie er ist.

## Bedingungen

- Nur `ui/**`.
- Vier Tore vor dem Commit, dazu `pnpm --filter @fachwerk/ui build`.
- Commit-Nachrichten auf Deutsch, ohne Backticks.
- Keine neuen Abhängigkeiten.

## Abnahme

1. Ein Regler mit `groesse: 270` in einem 300er-Element: das SVG ist
   270 × 270 (Test in `ui/src/visu/visu-css.test.ts` oder per
   `getBoundingClientRect` im bestehenden Test-Setup).
2. Ein Regler ohne `groesse` in einem 100 × 60-Element bleibt rund: 54 × 54,
   nicht 90 × 54.
3. Mit `tasten`: zwei Flächen je halbe Breite, Beschriftung unten mit
   Abstand; das Rad ist mit und ohne Tasten gleich groß.
4. Messung im PR: `tools/visu-abzug.mjs` auf „Lichtsteuerung EG 1",
   Vergleich gegen die Liste von Spur 1 — die Zeilen „FEHLT bei 15/15
   (270x270)" und „Breite/Hoehe 0 → 290" müssen verschwinden.
5. Screenshot des Reglers bei 0 %, 50 %, 100 % im PR.
