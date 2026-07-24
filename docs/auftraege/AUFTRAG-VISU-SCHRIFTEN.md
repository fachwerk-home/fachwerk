# AUFTRAG VISU-SCHRIFTEN: Symbol-Schriften im Renderer anwenden (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/visu-schriften`, zwingend von `origin/main`.
- **Voraussetzung (steht auf main):** ADR-0015, Design-Feld `schriftart`,
  Import legt Schriften in `visu/dateien/` ab, Laufzeit liefert sie unter
  `GET /api/visu/datei/<name>` aus (Scope `read`).
- **Pflichtlektüre:** `AGENTS.md`, `adr/0015-gewerk-dateien.md`,
  `schema/src/visu.ts` (`VisuDesign.schriftart`).

## Warum

Importierte Visus tragen Symbole als Zeichen aus der Schrift des Altsystems
(z. B. Rollladen auf/stopp/ab). Ohne die Schrift erscheinen sie als leere
Kästchen — die Bedienelemente sind unbeschriftet. Die Schriftdateien liegen
jetzt im Gewerk und werden ausgeliefert; es fehlt nur noch, sie zu deklarieren
und anzuwenden.

Im Referenz-Gewerk betrifft das 52 Elemente auf 13 verschiedenen Zeichen,
verteilt auf zwei Schriften.

## Umfang

1. **`@font-face` zur Laufzeit deklarieren** (`ui/src/visu/`): Für jede in den
   Designs vorkommende `schriftart` eine Regel erzeugen, die auf
   `/api/visu/datei/<name>.<endung>` zeigt. Die Endung ist nicht bekannt —
   probiere die vorhandene Datei, oder lade die Liste einmalig (siehe
   Integrationswunsch unten). Namen mit Leerzeichen korrekt kodieren
   (`KNX%20UF.ttf`).
2. **Familie anwenden:** `design.schriftart` → `font-family` auf dem Element,
   analog zu `design.text`/`schriftgroesse` in `designFuer`.
3. **Fallback:** Fehlt die Datei, darf nichts kaputtgehen — Element rendert
   wie bisher (Zeichen bleibt ein Kästchen), keine Konsolenfehler-Flut.
4. **Editor:** Auswahlfeld „Schriftart" im Design-Bereich, gefüllt aus den im
   Gewerk vorhandenen Schriften (siehe Integrationswunsch).

## Integrationswunsch an Spur 1

Es gibt noch keinen Endpunkt, der die vorhandenen Beilagen **auflistet** —
ohne ihn musst du Dateiendungen raten. Beschreibe im PR, was du brauchst
(z. B. `GET /api/visu/dateien` → `[{name, groesse}]`); ich baue es nach.
Bis dahin ist ein Versuch auf `.ttf` und dann `.woff2` vertretbar.

## Nicht-Scope

- Kein eigener Icon-Satz. Die Umstellung auf SVG-Symbole ist ein späterer,
  eigener Schritt (Backlog B-9) — hier geht es nur darum, importierte Anlagen
  originalgetreu darzustellen.
- Keine Änderungen an `core/**`, `schema/**`, `importer/**`.
- Schriften gehören NIE ins Repository (ADR-0015 D-4) — auch nicht als
  Testdatei unter `examples/`. Der Hygiene-Check erzwingt das; wenn du für
  einen Test eine Schrift brauchst, erzeuge sie im Test zur Laufzeit oder
  prüfe nur die erzeugte CSS-Regel.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktion für die `@font-face`-Erzeugung mit Test (Name mit Leerzeichen,
  fehlende Schriftart, mehrere Schriften).
- Handprobe im PR: eine Seite mit gesetzter `schriftart` zeigt das Zeichen
  statt eines Kästchens; ohne Datei bleibt die Seite bedienbar.
