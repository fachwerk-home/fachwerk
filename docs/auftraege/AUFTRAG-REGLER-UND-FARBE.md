# Auftrag: Drehregler und Farbauswahl auf die belegte Betriebsart bringen

Spur 2 (Codex), Bereich `ui/**`. Schema und Importer sind fertig, `main` steht
auf `347184f`.

## Warum jetzt

Die Betriebsart dieser beiden Bedienelemente stand bis gestern nicht fest. Der
Import nahm eine Voreinstellung an und vermerkte das im Bericht. Inzwischen ist
die Werteliste belegt, und der Importer setzt die Parameter. Damit kommen
Angaben im Gewerk an, die der Renderer noch nicht kennt — und drei Ausgaben,
die messbar nicht dem entsprechen, was die Altanlage auf den Bus schreibt.

Zwei Elemente der Anlage des Betreibers hängen daran: ein Dimmer am Wohnzimmer
(`art: poti_relativ`, 0 bis 255) und eine Farbauswahl (`modus: hsv`).

## A — die Farbauswahl schreibt das falsche Format

`farbwertFuerPixel` in `modell.ts` liefert heute:

| `modus` | heute | die Altanlage schreibt |
|---|---|---|
| `dimmen` | `Math.max(r, g, b)` | gewichtete Helligkeit: `0.2126·r + 0.7152·g + 0.0722·b`, ganzzahlig 0–255 |
| `hsv` | `"hsv(210,50%,80%)"` | **sechs Hexziffern**, je Anteil 0–255, Farbton 0–255 für den **vollen Kreis** (nicht 0–360), Kleinbuchstaben |
| sonst (RGB) | `"#rrggbb"` | **sechs Hexziffern ohne Doppelkreuz** |

Alle drei gehen auf denselben Datenpunkt wie in der Altanlage. Ein `#` zu viel
oder ein Farbton in Grad statt in 256 Schritten ist am Bus ein anderer Wert,
und die Gegenstelle versteht ihn nicht.

Der Importer schreibt jetzt `modus` ausdrücklich, mit den Werten `dimmen`,
`rgb` und `hsv` — `rgb` bitte als eigenen Fall annehmen statt als Rückfall.
Fehlt `modus`, bleibt der bisherige Rückfall richtig.

## B — `poti_relativ` kennt der Renderer nicht

`reglerSchreibwert` unterscheidet heute nur `inkrement` (schreibt die
Differenz) von allem anderen (schreibt den Zielwert). Der Importer liefert jetzt
drei Arten:

| `art` | Verhalten | Was auf KO2 geht |
|---|---|---|
| `poti` | Zeigerlage **ist** der Wert, auch ohne Ziehen | der Absolutwert |
| `poti_relativ` | Ausgangswert ist der Stand bei Gestenbeginn; die **Winkeldifferenz** seit dem Aufsetzen wird auf den Bereich abgebildet und aufaddiert. Ohne Bewegung ändert sich nichts | der Absolutwert |
| `inkrement` | jede Drehung über `schritt_winkel` Grad ändert um **einen** Schritt | ebenfalls der Absolutwert |

Zwei Dinge sind daran wichtig. Erstens: **alle drei schreiben einen
Absolutwert.** Dass `inkrement` heute die reine Differenz schreibt, passt zu
keiner der drei Arten — bitte auf den fortgeschriebenen Wert umstellen. Falls
es dafür einen Grund gab, den ich nicht sehe, sag es, bevor du es änderst.

Zweitens: `poti_relativ` ist nicht `poti`. Ein absolutes Poti springt beim
Aufsetzen auf die Zeigerlage — an einer Deckenlampe heißt das, dass jede
Berührung die Helligkeit reißt. Genau deshalb steht der Dimmer des Betreibers
auf relativ.

Neu ist `schritt_winkel` (5 oder 15). Er gilt nur bei `inkrement`.

## C — `groesse` wird ignoriert

`.regler-kreis` in `visu.css` hat `width: min(90%, 90px)`. Der Importer liefert
seit Längerem `groesse` (beim Betreiber: 90) und `knopf_anteil` (70), beides
wird nicht gelesen. Der Betreiber hat das mehrfach gemeldet: „Der Wohnzimmer
Drehregler ist von der Größe her völlig off."

`groesse` ist die Kantenlänge in Pixeln und soll die feste Obergrenze ersetzen;
das Element darf sie weiterhin nicht überschreiten.

## D — Winkelbereich

Der Importer liefert bei Typ 11 `winkel_von`/`winkel_bis` bereits im
Zählsinn des Renderers: die Altanlage zählt ab **unten Mitte**, der Renderer ab
**oben** (`atan2(x, -y)`), beide im Uhrzeigersinn — der Versatz von 180 Grad
steckt schon in den Zahlen. Es ist also nichts umzurechnen, die Werte gelten
unverändert. Diese Zeile steht nur hier, damit niemand ein zweites Mal dreht.

Typ 12 liefert keine Winkel; dort bleiben die Vorgaben.

## Bedingungen

- Nur `ui/**`.
- Vier Tore vor dem Commit: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `bash tools/check-repo.sh`, dazu `pnpm --filter @fachwerk/ui build`.
- Commit-Nachrichten auf Deutsch, ohne Backticks.

## Abnahme

1. `modus: hsv` erzeugt sechs Kleinbuchstaben-Hexziffern, Farbton 0–255.
2. `modus: rgb` erzeugt sechs Hexziffern **ohne** `#`.
3. `modus: dimmen` erzeugt die gewichtete Helligkeit, nicht das Maximum.
4. `art: poti_relativ`: Aufsetzen ohne Bewegung ändert den Wert nicht.
5. `art: inkrement` mit `schritt_winkel: 15`: eine Drehung um 40 Grad ergibt
   zwei Schritte, keine 40.
6. Ein Regler mit `groesse: 90` misst 90 Pixel, einer mit `groesse: 240`
   entsprechend mehr — beide bis zur Elementgrenze.
7. Tests für A und B; für C genügt ein Test auf die gerechnete Größe.
