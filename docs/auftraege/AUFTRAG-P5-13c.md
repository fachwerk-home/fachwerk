# AUFTRAG P5-13c: Import der Archiv-Befehle (cmd 13/40/42 → Archiv-Definitionen)

- **Spur:** 3 (Auftrags-Agent)
- **Branch:** `auftrag/p5-13c-archiv-import`
- **Abgabe:** Pull Request gegen `main`; Merge macht der Maintainer.
- **Regeln:** `AGENTS.md` ist bindend. Lies zusätzlich `GEMINI.md` — dort
  stehen die Lehren aus deinem letzten Einsatz. Dieser Auftrag enthält
  deshalb einen verbindlichen Arbeitsablauf mit exakten Befehlen.

## Arbeitsablauf (GENAU SO, Schritt für Schritt)

Alle Befehle in PowerShell. Schritt 2 ist die Voraussetzung für alles —
wenn er fehlschlägt: STOPP und melden, NICHT weiterarbeiten.

```powershell
# 1. Eigenes Worktree anlegen, Branch zwingend von origin/main
cd C:\Users\junig\Documents\VSC\fachwerk
git fetch origin
git worktree add ..\fachwerk-spur3 -b auftrag/p5-13c-archiv-import origin/main
cd ..\fachwerk-spur3

# 2. Werkzeuge in den PATH (portables Node+pnpm) und PRUEFEN
$env:Path = "$env:USERPROFILE\tools\node;" + $env:Path
pnpm --version   # MUSS eine Version ausgeben. Fehler => STOPP + melden.
pnpm install --frozen-lockfile

# 3. VOR dem ersten Commit und VOR JEDEM weiteren Commit — alle vier:
pnpm typecheck
pnpm lint
pnpm test        # Vitest! Tests importieren aus "vitest", NIE "node:test"
bash tools/check-repo.sh
# Ein einziger roter Befehl => fixen, nicht committen.

# 4. Stagen: NUR deine Dateien, einzeln benannt. NIE "git add ." / "-A".
git add importer/src/logik.ts importer/src/logik.test.ts importer/src/index.ts

# 5. Committen (Message deutsch, Titel "P5-13c: ...", KEINE Backticks):
git commit -m "P5-13c: <Titel>" -m "<Begruendung>" -m "Co-Authored-By: Gemini <noreply@google.com>"

# 6. Pushen (nur dein Branch):
git push -u origin auftrag/p5-13c-archiv-import
```

Arbeitsnotizen (task.md o. Ä.) legst du unter `$env:TEMP` ab, NIE im Repo.
Die Verzeichnisse `_ingest/` und `research/` sind TABU — alles, was du
brauchst, steht in diesem Auftrag und in den genannten Quelldateien.

## Kontext

Der Importer (`@fachwerk/importer`) übersetzt Nutzdaten eines
Altsystem-Projekt-Dumps in ein Fachwerk-Gewerk. Logikseiten samt
„Ausgangsbox"-Befehlen werden in `importer/src/logik.ts` abgebildet;
der Befehlskatalog steht in `importer/src/befehle-katalog.ts`.

Bisher werden die Datenarchiv-Befehle nur als Hinweis gemeldet. P5-13a
(Archiv-Kern, gemergt) liefert jetzt das Ziel: Archiv-Definitionen
(`ArchivDefinition` aus `@fachwerk/schema`, Datei `archiv/*.yaml` —
siehe `specs/SPEC-004-archive.md`). Deine Aufgabe: aus den Befehlen
**Archiv-Definitionen synthetisieren**. Der Dump enthält KEINE
Archiv-Definitionstabelle — die Definitionen entstehen aus der Nutzung.

## Pflichtlektüre

1. `AGENTS.md` + `GEMINI.md`
2. `specs/SPEC-004-archive.md` (dein eigenes Werk aus P5-13a)
3. `importer/src/logik.ts` — besonders der Ausgangsbox-Block (suche nach
   „Ausgangsbox → Befehle ausführen"); dort siehst du das Muster für cmd 1/2
   und wie Hinweise vs. Fehler gemeldet werden
4. `importer/src/befehle-katalog.ts` — cmd 13/40/42/50/51/52 (Kategorie archiv)
5. `importer/src/logik.test.ts` — so sehen die synthetischen Test-Fixtures aus
6. `schema/src/archiv.ts` — Zieltyp `ArchivDefinition`

## Dateibesitz (NUR diese Dateien ändern)

- `importer/src/logik.ts`
- `importer/src/logik.test.ts`
- `importer/src/index.ts` — nur Export-Zeilen ANFÜGEN, falls neue Typen

**Tabu:** alles andere. Das Schreiben der `archiv/*.yaml`-Dateien passiert
in `cli/src/import.ts` (Spur 1) — du lieferst die Definitionen als Teil des
Ergebnisses, der Maintainer verdrahtet das Schreiben beim Merge.

## Fachlicher Umfang

Erweitere das Seiten-Ergebnis (`KonvertierteSeite` bzw. die passende
Ergebnis-Struktur in `logik.ts`) um `archive: Map<string, ArchivDefinition>`
(Archiv-Schlüssel → Definition) und behandle in der Ausgangsbox-Schleife:

1. **cmd 13 (Eingangswert → Archiv `id1`):** Quelle ist der Wert-Eingang der
   Box (`wertVon` existiert im Code bereits).
   - Zeigt `wertVon` auf einen Datenpunkt (`dp:<schluessel>`): Definition
     `archiv_<id1>` mit `quelle: <schluessel>` anlegen.
   - Zeigt `wertVon` auf einen Baustein-PORT: dasselbe Muster wie beim
     dp→dp-Fall im Bestand — es gibt keinen Datenpunkt, also Hinweis melden:
     `Ausgangsbox <id>: Archiv <id1> haengt an Port <...> — Hilfs-Datenpunkt
     noetig (manuell nacharbeiten)`. KEINEN Datenpunkt selbst erfinden
     (das entscheidet der Maintainer später).
2. **cmd 42 (KO-Wert → Archiv `id1`):** Quelle ist KO `id2` →
   `quelle: koZuSchluessel.get(id2)`; unbekanntes KO ⇒ Fehler melden
   (Muster cmd 1).
3. **cmd 40 (fester Wert → Archiv):** kein Zeitreihen-Normalfall ⇒ Hinweis
   („nicht abbildbar, manuell prüfen"), keine Definition.
4. **cmd 50/51/52 (Einträge entfernen):** Hinweis, keine Definition.
5. **Defaults der synthetisierten Definition:** `name: "Archiv <id1> (aus
   Import)"`, `aufbewahrung_tage: 365`, `notizen` nennt Seite + Box +
   Befehl. Kein `mindestabstand_s`.
6. **Mehrfachnutzung:** Dieselbe Archiv-ID aus mehreren Befehlen/Seiten mit
   DERSELBEN Quelle ⇒ eine Definition, kein Fehler. Mit UNTERSCHIEDLICHER
   Quelle ⇒ Fehler melden (Muster vorhandener Meldungen), erste Definition
   gewinnt.

## Tests (Vitest, synthetische Fixtures wie in logik.test.ts)

- cmd 13 mit dp-Quelle ⇒ Definition mit richtiger Quelle + Defaults
- cmd 13 mit Port-Quelle ⇒ Hinweis, keine Definition
- cmd 42 ⇒ Definition; cmd 42 mit unbekanntem KO ⇒ Fehler
- cmd 40 und cmd 50 ⇒ Hinweis, keine Definition
- gleiche Archiv-ID zweimal mit gleicher Quelle ⇒ eine Definition;
  mit anderer Quelle ⇒ Fehler
- Bestehende Tests bleiben grün (nichts am cmd-1/2-Verhalten ändern)

## Abnahme

1. Arbeitsablauf oben eingehalten (Worktree, Branch von origin/main,
   Gates VOR jedem Commit lokal grün, nur eigene Dateien gestaged).
2. Alle 4 Gates grün; keine neuen Dependencies; `pnpm-lock.yaml` unverändert.
3. Alle Testfälle aus der Liste vorhanden und grün.
4. PR-Beschreibung: Detailentscheidungen, offene Fragen, Integrationswunsch
   an Spur 1 („cli/src/import.ts: archive nach archiv/import.yaml
   schreiben").
