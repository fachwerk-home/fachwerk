# AUFTRAG UI-IMPORT: Menüpunkt „Import" in der Admin-UI (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/ui-import`, zwingend von `origin/main`.
- **Voraussetzung (steht auf main, End-zu-End getestet):** die komplette API.
- **Pflichtlektüre:** `AGENTS.md`, `docs/IMPORT-AUF-DEM-HOST.md`,
  `core/src/api/handler.ts` (`ImportDienst`).

## Warum

Ein Gewerk aus einer Altanlage entsteht heute entweder lokal (dann muss es
irgendwie auf den Host) oder per Portainer-Stack (dann muss man Dateien auf den
Host legen). Beides bedeutet: Konsole. Der Betreiber hat zu Recht gefragt, ob
es nicht einfach einen Menüpunkt gibt, unter dem er das Paket hochlädt.

Die API kann das inzwischen vollständig. Es fehlt nur die Oberfläche.

## Die API (fertig, mit curl geprüft)

| Route | Scope | Zweck |
|---|---|---|
| `POST /api/gewerk/quellen/<name>` | `write:gewerk` | Datei hochladen, **roher Body** (kein multipart), bis 32 MB |
| `GET /api/gewerk/quellen` | `read` | was liegt bereit (Name + Größe) |
| `DELETE /api/gewerk/quellen/<name>` | `write:gewerk` | Datei entfernen |
| `POST /api/gewerk/import` | `write:gewerk` | Import starten → `{ angenommen, bericht }` |
| `POST /api/gewerk/import/uebernehmen` | `activate:dev` | übernehmen + aktivieren → `{ angenommen, dauerMs }` |

Erlaubt sind `.sql`, `.tar`, `.json`; alles andere ergibt 415. Hochladen geht
per `fetch(url, { method: "POST", body: datei })` — `File`/`Blob` direkt als
Body, **kein FormData** (der Server parst kein multipart).

## Umfang

1. **Menüpunkt „Import"** in der Sidebar (`ui/src/admin/main.tsx`, neben
   Datenpunkte/Traces/Logik/Archive/Visu-Editor), mit Taste `6`.
2. **Dateiauswahl + Ablegen:** Auswahlfeld und Ziehen-und-Ablegen. Fortschritt
   sichtbar (ein 1,7-MB-Paket ist schnell, ein größerer Dump nicht). Danach die
   Liste der bereitliegenden Quellen mit Größe und Entfernen-Knopf.
3. **Zwei getrennte Knöpfe — bewusst nicht einer:**
   - *Importieren* → zeigt den zurückgegebenen `bericht` als vorformatierten
     Text (er enthält genau das, was auch im Log steht: was konvertiert wurde,
     was offen ist).
   - *Übernehmen und aktivieren* → erst **nach** einem erfolgreichen Import
     anklickbar, mit Rückfrage. Der Text der Rückfrage muss sagen, was
     passiert: **das laufende Gewerk wird ersetzt** (der Vorgänger bleibt als
     `<gewerk>.alt` auf dem Host liegen).
4. **Scopes spiegeln:** Fehlt `write:gewerk`, sind Upload und Import
   deaktiviert; fehlt `activate:dev`, nur das Übernehmen. Wie bei den anderen
   Ansichten: ausblenden/deaktivieren ist Bequemlichkeit, der Schutz sitzt im
   Handler.
5. **Fehler ehrlich zeigen:** 415 (falsches Format), 413 (zu groß), 422 (Import
   fehlgeschlagen — `fehler` enthält den Bericht). Keine generische Meldung.

## Nicht-Scope

- Keine Änderungen an `core/**`, `cli/**`, `schema/**`. Fehlt dir etwas in der
  API: im PR als Integrationswunsch beschreiben, Spur 1 baut es.
- Kein Fortschrittsbalken pro Byte, wenn es die Umsetzung verkompliziert —
  „lädt …/fertig" genügt.
- Der Weg über den Portainer-Stack bleibt bestehen (Doku), er wird nicht ersetzt.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktionen (z. B. Formatprüfung, Statuslogik der Knöpfe) mit Tests.
- Handprobe im PR: Paket hochladen, importieren, Bericht lesen, übernehmen —
  die Statusleiste zeigt danach das neue Gewerk. Zweiter Durchlauf ohne
  `activate:dev`: Übernehmen ist gesperrt.
