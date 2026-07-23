# AUFTRAG MIGRATIONS-REPORT: Was der Betreiber selbst klären muss (Spur 3)

- **Ausführender:** Gemini (Spur 3). Dateibesitz: **ausschließlich zwei NEUE
  Dateien** `importer/src/migration.ts` + `importer/src/migration.test.ts`,
  plus **angehängte** Export-Zeilen in `importer/src/index.ts`.
- **Branch:** `auftrag/migrations-report`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md` (besonders §4 Gates und §3 Regeln),
  `importer/src/logik.ts` (Typ `StubInfo`), `docs/BACKLOG.md` (B-6).

## Warum das gebraucht wird

Wenn jemand seine Altanlage importiert, kommt heraus: „25 Logikbausteine und
30 Visuelemente sind unbekannt." Fachwerk **kann nicht wissen**, ob es die
Funktion längst an Bord hat — es kennt die fremden Bausteine ja nicht. Deshalb
braucht der Betreiber eine präzise, handlungsfähige Liste: *was* ist fremd,
*wie oft* wird es benutzt, *wo* steckt es. Diese Liste ist die Grundlage für
die spätere Triage (LLM-gestützt) und für Feature-Requests.

Die Struktur wird beim Import bereits vollständig übernommen; unbekannte
Bausteine werden als **Stubs** angelegt (Gewerk lädt und läuft, die Stelle ist
inert und markiert). Es geht hier also **nicht** um Lauffähigkeit, sondern um
Sichtbarkeit: eine ehrliche Aufgabenliste.

## Umfang

Eine **reine Funktion** plus ein Markdown-Renderer. Keine Dateizugriffe, kein
`console.log`, keine CLI-Anbindung — das Verdrahten macht Spur 1.

### Verbindlicher Vertrag (exakt so umsetzen)

```ts
/** Ein Posten, den der Betreiber selbst klären muss. */
export interface MigrationsPosten {
  art: "lbs" | "vse";
  /** LBS: functionId · VSE: controltyp */
  id: number;
  /** Name aus den Nutzdaten; leer, wenn nicht ableitbar. */
  name: string;
  verwendungen: number;
  /** Seiten-/Slugnamen, alphabetisch, ohne Duplikate. */
  fundstellen: string[];
  /** nur art="lbs": Portzahlen aus dem Stub. */
  eingaenge?: number;
  ausgaenge?: number;
}

export interface MigrationsReport {
  /** absteigend nach verwendungen, bei Gleichstand aufsteigend nach id. */
  lbs: MigrationsPosten[];
  vse: MigrationsPosten[];
  summe: { lbs: number; vse: number };
}

export interface MigrationsEingabe {
  stubs: ReadonlyArray<{
    functionId: number;
    name: string;
    eingaenge: number;
    ausgaenge: number;
    verwendungen?: number;
    seiten?: readonly string[];
  }>;
  vse: ReadonlyArray<{
    controltyp: number;
    verwendungen: number;
    name?: string;
    seiten?: readonly string[];
  }>;
}

export function ermittleMigrationsBedarf(eingabe: MigrationsEingabe): MigrationsReport;
export function migrationsReportAlsMarkdown(report: MigrationsReport): string;
```

**Alles kommt als Parameter herein.** Importiere NICHTS aus `visu.ts` oder
`konvertiere.ts` — welche Elementtypen bekannt sind, entscheidet der Aufrufer
(Spur 1) und übergibt nur die übrig gebliebenen Fremdposten.

> **Lehre aus P5-13c, bitte ernst nehmen:** Der Report ist ein **eigener
> Rückgabewert**. Er wird NICHT in ein bestehendes Ergebnisobjekt hineingefaltet
> und nicht weggelassen, wenn eine Liste leer ist. Leere Listen sind gültige
> Ergebnisse (`lbs: []`, `summe.lbs: 0`) — damals gingen Ergebnisse verloren,
> weil ein „nichts gefunden"-Fall kein Feld hatte.

### Markdown-Ausgabe

`migrationsReportAlsMarkdown` liefert den Text für eine Datei `MIGRATION.md`,
die der Betreiber liest, an ein LLM gibt oder an ein Issue hängt. Anforderungen:

- **Deterministisch:** gleiche Eingabe ⇒ zeichengleiche Ausgabe (Test!).
- Kurzfassung oben („25 Logikbausteine, 30 Visuelemente brauchen eine
  Entscheidung"), dann je eine Tabelle für LBS und VSE mit
  ID · Name · Verwendungen · Fundstellen (und Ports bei LBS).
- Ist eine Liste leer, erscheint statt der Tabelle eine Zeile wie
  „Keine unbekannten Logikbausteine — nichts zu tun."
- Danach **wörtlich** dieser Hinweisblock (Wortlaut ist Projektpolitik, bitte
  nicht umformulieren):

```
## Was jetzt zu tun ist

Diese Bausteine/Elemente stammen nicht aus Fachwerk. Die Struktur ist
importiert und das Gewerk läuft — die betroffenen Stellen sind aber noch ohne
Funktion (Stub). Für jeden Posten gibt es drei Wege:

1. **Prüfen, ob Fachwerk es schon kann.** Vieles ist eine Variante von etwas,
   das es nativ gibt (ein Schiebeschalter ist ein Schalter). Anleitung:
   docs/MIGRATION-TRIAGE.md
2. **Saubere Umsetzung beitragen.** Der ursprüngliche Autor (oder du) kann die
   Funktion für Fachwerk neu implementieren und beisteuern.
3. **Feature-Request stellen.** Beschreibe, WAS der Baustein tun soll.

**Wichtig:** Beschreibe in Issues und Beiträgen immer nur das *Verhalten*.
Füge niemals Quellcode des Originalbausteins ein — weder ins Issue noch ins
Repository. Fachwerk ist eine Neuentwicklung und muss frei von fremdem Code
bleiben; ein eingefügter Schnipsel gefährdet das gesamte Projekt.
```

## Nicht-Scope

- Keine Bewertung, ob Fachwerk die Funktion ersetzen kann (das ist die spätere
  Triage und braucht den Fähigkeiten-Katalog — baut Spur 1).
- Keine CLI-Ausgabe, kein Schreiben von Dateien, keine Änderung an
  `cli/**`, `core/**`, `visu.ts`, `logik.ts`, `konvertiere.ts`.
- Kein neues Paket, keine neuen Abhängigkeiten.

## Verbindlicher Arbeitsablauf

1. `git fetch origin && git switch -c auftrag/migrations-report origin/main`
2. Eigenes Arbeitsverzeichnis: `git worktree add ../fachwerk-migration auftrag/migrations-report`
3. PATH prüfen (Node 24 + pnpm müssen laufen). Geht das nicht: **STOPP**, melden.
4. Implementieren **nur** in den zwei neuen Dateien; Export-Zeilen in
   `importer/src/index.ts` nur ANHÄNGEN.
5. Gates lokal, alle vier, **blockierend**:
   `pnpm typecheck` · `pnpm lint` · `pnpm test` · `bash tools/check-repo.sh`
6. `git add importer/src/migration.ts importer/src/migration.test.ts importer/src/index.ts`
   (niemals `git add .` oder `-A`)
7. Commit auf Deutsch mit Trailer, dann push des Branches. **Nicht** nach `main`
   pushen, **nicht** selbst mergen.

## Abnahme

- Gates grün; Tests ausschließlich mit **synthetischen** Fixtures
  (keine Betreiberdaten im Repo).
- Sortierung und Markdown sind deterministisch (Test vergleicht zeichengenau).
- Leere Listen liefern gültige Reports (kein `undefined`, kein Weglassen).
- Der Hinweisblock steht wörtlich im Markdown.
