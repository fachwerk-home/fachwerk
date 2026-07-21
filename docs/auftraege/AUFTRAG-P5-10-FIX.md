# AUFTRAG P5-10-FIX: Visu-Editor — Nachbesserung nach Review — Codex

- **Spur:** 2 (Codex) · **Branch:** `auftrag/p5-10-visu-editor-fix` (Basis: aktueller `origin/main`)
- **Dateibesitz:** `ui/**`. API-Wünsche → PR-Text.
- **Kontext:** P5-10 ist bereits auf `main`, wurde aber ungeprüft gemergt.
  Das Grundgerüst trägt; die Handprobe am laufenden System (Spur 1) hat
  mergeblockierende Fehler gefunden, die alle vier Gates überlebt haben.
  Dieser Auftrag behebt sie. **Nicht neu bauen — gezielt reparieren.**

## Zwingend: so wird abgenommen

Grüne Gates reichen NICHT (sie waren schon grün, als die Fehler drin waren).
Jeder Punkt unten braucht einen **Test, der ohne den Fix rot ist** — plus die
Handprobe aus Abschnitt „Abnahme". Wo möglich: Test, der die erzeugte YAML
gegen das Schema (`schema/schemas/visu-seite.schema.json`) validiert, nicht nur
gegen einen erwarteten String.

## Fehler (nach Schwere)

### F1 (SCHWER, Datenverlust): Leere Container serialisieren zu `null`
`ui/src/admin/visu-yaml.ts:55-65` (`zeilen`). Ein leeres Objekt/Array erzeugt
`elemente:` bzw. `bindungen:` ohne Kind. Der Loader (`yaml`, 1.2) liest das als
`null`; das Schema verlangt `elemente` als Objekt, `bindungen` als Objekt mit
`minProperties: 1`. Folge: **Am laufenden System reproduziert** — neue Seite
anlegen → Speichern → Aktivieren meldet `angenommen:true, "Aktiviert in 155 ms"`,
aber die Seite VERSCHWINDET still (`WARNUNG Visu … /elemente: must be object`,
fehlt danach in `/api/visu`). Die UI meldet Erfolg, die Seite ist weg.

Drei erreichbare Auslöser, alle zu fixen:
- Neue Seite → Speichern (`leereSeite` hat `elemente: {}`, `visu-editor.tsx:57-68`).
- Alle Elemente löschen → Speichern.
- Letzte Bindung entfernen: `setBindung` (`visu-editor.tsx:185-191`) macht
  `delete e.bindungen[rolle]`, lässt das leere Objekt stehen → `bindungen:` → `null`.

**Fix:** Serializer gibt für leere Container `{}` bzw. `[]` aus. Zusätzlich
leere `bindungen`/`aktionen`-Objekte beim Mutieren ganz entfernen (nicht leer
stehen lassen). Test: neue leere Seite → serialisieren → gegen Schema validieren
→ muss gültig sein; und Roundtrip über eine echte Beispielseite.

### F2 (HOCH, Datenverlust): Seitenwechsel verwirft ungespeicherte Edits
`ui/src/admin/visu-editor.tsx:296-313`. Der Lade-Effekt hängt an
`[seiteKey, seiten]` und macht bedingungslos `setSeite(clone(...))`,
`setDirty(false)`. Edits leben nur im `seite`-State; ein Wechsel im Dropdown
(`:402`) wirft sie ohne Warnung weg. **Fix:** bei `dirty` vor dem Wechsel
warnen/bestätigen (oder Änderungen in die `seiten`-Map zurückschreiben). Test
für die Warn-/Schutzlogik.

### F3 (MITTEL): Undo/Redo durch reine Auswahlklicks verschmutzt
`ui/src/admin/visu-editor.tsx:511` — `onPointerDown` ruft `history.merke(seite)`
bei JEDEM Pointer-Down, auch bei reiner Auswahl ohne Drag. `merke` (`:129-132`)
pusht einen Klon und leert den Redo-Stack. Folge: Auswahl erzeugt No-op-Undo-
Einträge; ein Klick nach Undo macht Redo unerreichbar. **Fix:** `merke` erst,
wenn ein Drag tatsächlich beginnt (erste Bewegung in `onPointerMove`), nicht bei
bloßer Auswahl. Undo/Redo ist explizites Abnahmekriterium — Test dafür.

### F4 (MITTEL): String-Skalare, die wie Zahl/Bool aussehen, kippen den Typ
`ui/src/admin/visu-yaml.ts:23` (`skalar`) gibt Strings, die
`^[a-zA-Z0-9_.:/-]+$` erfüllen, unquotiert aus. `name: 800` → beim Reload Zahl
(Schema will String → Ablehnung); `"true"` → Bool. **Fix:** Strings quoten, die
sonst als Zahl/Bool/`null` reparst würden. Test mit `"800"`, `"true"`, `"0"`.

### F5 (MITTEL): Roundtrip-„kanonisch, kleine Diffs" nicht erfüllt; Test trivial
Unverändertes Speichern ist byte-identisch (Raw-Passthrough,
`visu-yaml.ts:96`) — gut. Aber die erste Änderung reserialisiert die ganze
Datei in Block-Stil, während die Beispielseiten Flow-Stil nutzen
(`wohnzimmer.yaml:64-112`) → großer Diff (ADR-0004 will kleine). Der Test
(`visu-yaml.test.ts:21-24`) prüft nur `=== raw` mit 2 fabrizierten Zeilen, lädt
nie eine echte Seite, validiert nie gegen das Schema. **Fix:** echten
Roundtrip-Test (echte Beispielseite laden → serialisieren → gegen Schema
validieren); Serialisierung so, dass ein geänderter Wert nicht die ganze Datei
umbricht. Falls Flow-Stil-Erhalt zu teuer ist: als Entscheidung im PR begründen.

### F6 (NIEDRIG): Read-only erst reaktiv erkannt
`visu-editor.tsx:346,361` setzen `readonlyGrund` erst NACH dem ersten 401/403.
Bis dahin laufen Speichern/Aktivieren „ins Leere" — genau was Umfang #6
vermeiden wollte. GET-Fehler (`hole`, `api.ts:183-192`) werfen `Error`, nicht
`ApiFehler`, werden also nie als read-only erkannt. **Fix:** Token-/Scope-Zustand
proaktiv prüfen und Buttons vorab sperren.

## Hinweis Auth (seit P5-12)

Der Schreibpfad verlangt jetzt Scopes: Speichern braucht `write:gewerk`,
Aktivieren `activate:dev` (nicht mehr nur „Token vorhanden"). Ein Token mit
Default-Scopes (`read,operate`) bekommt an beiden Buttons 403. Das ist korrektes
Verhalten — die read-only-Anzeige (F6) muss das sauber abbilden. Für die
Handprobe: Token mit `FACHWERK_API_TOKEN_SCOPES=read,operate,write:gewerk,activate:dev`.

## Abnahme

1. Alle 4 Gates + UI-Build grün — plus je ein Test pro F1–F5, der ohne den Fix rot ist.
2. **Handprobe im PR (GIF/Screenshots) am laufenden Stack mit korrekt gescoptem Token:**
   neue Seite anlegen → Element drauf → Speichern → Aktivieren → Seite erscheint
   in `/api/visu` und im Visu-Client (NICHT still verschwunden). Genau der Fall,
   der jetzt bricht.
3. Undo/Redo: Auswahl erzeugt keinen Undo-Eintrag; Redo überlebt einen
   Auswahlklick.
4. PR offen lassen — **nicht selbst mergen** (AGENTS.md §3.3). Spur 1 merged nach
   eigener Handprobe.
