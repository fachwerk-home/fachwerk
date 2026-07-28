# AUFTRAG UI-IMPORT-2: Der zweite Schritt darf nicht übersehen werden (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/ui-import-2`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md`, `docs/IMPORT-AUF-DEM-HOST.md`,
  `ui/src/admin/import.tsx` + `import-modell.ts` (dein eigener Stand).

## Warum

Der Import ist zweistufig, und das ist richtig so: *Importieren* schreibt ein
Gewerk daneben, *Übernehmen und aktivieren* schaltet um. Der Betreiber hat den
zweiten Knopf beim ersten echten Durchlauf schlicht **übersehen** — er sah den
Bericht, hielt den Vorgang für abgeschlossen und wunderte sich, dass die Anlage
unverändert lief. Sein eigener Vorschlag, wörtlich:

> Vielleicht kann man es ja so machen, dass der „Importieren"-Knopf grau oder
> ein anderes Grün wird, und „Übernehmen und aktivieren" wird hervorgehoben.
> Dann übersieht man den nicht so leicht.

Genau das ist der Auftrag. Nach einem erfolgreichen Import ist *Importieren*
getan — die Betonung muss auf den Schritt wandern, der noch aussteht.

## Umfang

1. **Betonung wandert.** Solange kein erfolgreicher Import vorliegt, ist
   *Importieren* die Hauptaktion. Danach tritt sie zurück (sekundär) und
   *Übernehmen und aktivieren* wird die Hauptaktion. Ein erneuter Import bleibt
   möglich — nur eben nicht mehr betont.
2. **Sag, was noch fehlt.** Nach dem Bericht gehört ein Satz darüber, dass das
   laufende Gewerk noch unverändert ist und der zweite Schritt es umschaltet.
   Kein Ausrufezeichen-Banner, ein klarer Satz.
3. **Rückfragetext korrigieren** — er ist inhaltlich falsch geworden. Bisher:
   „Der Vorgänger bleibt auf dem Host als `<gewerk>.alt` liegen." Richtig ist
   seit `e4e…` (core/cli): der Vorgänger liegt in
   **`/daten/import/gewerk-vorher`** (im Daten-Volume, übersteht ein Redeploy).
   Der Rückweg steht in `docs/IMPORT-AUF-DEM-HOST.md`; verweise darauf, statt
   den Befehl in die UI zu kopieren.
4. **Erfolg sichtbar machen.** Nach dem Übernehmen muss ohne Zweifel erkennbar
   sein, dass umgeschaltet wurde (die Statusleiste zeigt neue Zahlen — sie
   allein hat der Betreiber aber nicht als Bestätigung gelesen). Ein
   Ergebnis-Satz an der Stelle, wo er gerade hinschaut.

## Ausdrücklich NICHT

- Die beiden Knöpfe zu einem zusammenlegen. Der Zweischritt ist die
  Sicherheitseigenschaft dieses Weges, nicht ein Umweg.
- Automatisches Übernehmen nach erfolgreichem Import.
- Änderungen an `core/**`, `cli/**`, `schema/**`.
- Farben frei erfinden: nimm die Rollen aus dem Design-System (P5-UI), nicht
  neue Hex-Werte.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Die Statuslogik bleibt eine reine Funktion mit Tests — die neue Betonung ist
  ein weiterer Rückgabewert, kein `if` im JSX.
- Handprobe im PR: Vor dem Import ist *Importieren* betont; nach dem Bericht
  ist es *Übernehmen und aktivieren*; nach dem Übernehmen steht dort ein
  eindeutiger Erfolgssatz.
- Ohne `activate:dev` bleibt *Übernehmen* gesperrt — auch wenn es jetzt die
  betonte Aktion wäre. Betonung ist Gestaltung, nicht Berechtigung.
