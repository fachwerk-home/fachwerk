# AUFTRAG P5-UI-LOGIN: Anmeldung in der Admin-UI und im Visu-Client (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/p5-ui-login`, zwingend von `origin/main`.
- **Voraussetzung:** P5-12 ist gemergt (Server-Seite steht komplett).
- **Pflichtlektüre:** `AGENTS.md`, `docs/AUTH-UND-SCOPES.md` (der API-Vertrag —
  dort steht jeder Endpunkt mit Antwortform), `core/src/api/scope-matrix.test.ts`
  (welcher Scope welche Route öffnet).

## Warum das jetzt dran ist

Seit P5-12 kann der Betreiber Nutzer anlegen. Sobald er das tut, antwortet die
API auf **jede** Anfrage ohne Anmeldung mit 401 — die UI zeigt dann nur noch
Fehler, weil sie kein Login kennt. Der Kern ist fertig, die Tür fehlt.

## Umfang

1. **Login-Ansicht** (Admin-UI und Visu-Client): Name + Passwort →
   `POST /api/login`. Bei 200 setzt der Server das Cookie selbst; die UI muss
   das Token **nicht** speichern und soll es auch nicht (kein localStorage —
   HttpOnly ist genau deshalb HttpOnly).
2. **401-Behandlung an einer Stelle:** Der zentrale Fetch-Helfer
   (`ui/src/lib/api.ts`) schaltet bei 401 auf die Login-Ansicht um, statt einen
   Fehler in eine Tabelle zu schreiben. Gleiches für den WebSocket: schlägt der
   Upgrade fehl, ist das seit P5-12 der normale Weg für „nicht angemeldet".
3. **Rechte spiegeln:** Einmal `GET /api/ich` abfragen und Bedienelemente
   ausblenden/deaktivieren, für die der Scope fehlt (`operate` → Bedienen,
   `write:gewerk` → Speichern im Editor, `activate:dev` → Aktivieren).
   Das ist Bequemlichkeit, **kein** Schutz — der sitzt im Handler. Also bitte
   keine Logik bauen, die sich auf dieses Ausblenden verlässt.
4. **Abmelden** sichtbar in der Sidebar: `POST /api/logout`, danach zurück zur
   Login-Ansicht.
5. **Fehlermeldungen ehrlich, aber knapp:** 401 → „Anmeldung fehlgeschlagen"
   (nie „Nutzer unbekannt" — der Server unterscheidet das absichtlich nicht),
   429 → Hinweis auf das Rate-Limit mit Wartezeit.

## Nicht-Scope

- Keine Änderungen an `core/**`, `cli/**` oder der API. Fehlt dir dort etwas:
  im PR als „Integrationswunsch" beschreiben, Spur 1 erledigt das.
- Keine Nutzerverwaltung im Browser (Anlegen/Löschen bleibt CLI — das Passwort
  soll nicht durch ein Formular wandern, solange kein TLS Pflicht ist).
- Kein „Angemeldet bleiben"-Schalter: das Cookie hält ohnehin 30 Tage.

## Abnahme

- Alle Gates grün (`pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `bash tools/check-repo.sh`).
- Mit angelegtem Nutzer: UI zeigt Login, nach Anmeldung läuft alles wie vorher
  (inkl. Live-Kanal). Ohne angelegten Nutzer: UI verhält sich unverändert
  (anonym lesend) und zeigt **kein** Login-Formular.
- Ein Nutzer mit nur `read` sieht keine Bedien-Schaltflächen — und ein
  manueller POST wird trotzdem vom Server abgelehnt (kurz im PR belegen).
