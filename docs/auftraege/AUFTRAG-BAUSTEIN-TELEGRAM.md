# AUFTRAG BAUSTEIN-TELEGRAM: Telegram-Versand statt Stub (Gemini)

- **Spur:** 3 (Gemini) · **Branch:** `auftrag/baustein-telegram`
- **Arbeitsablauf:** EXAKT wie in AUFTRAG-P5-13c.md § Arbeitsablauf
  (Worktree, Branch von origin/main, PATH-Prüfung, Gates BLOCKIEREND,
  git add nur eigene Dateien). Regeln: `AGENTS.md` + `GEMINI.md`.
- **Dateibesitz:** `examples/bausteine-telegram/**` (neu) und
  `docs/BAUSTEIN-SDK.md` (nur Abschnitt anfügen). Tabu: alles andere,
  insbesondere core/, importer/, die Stub-Verzeichnisse des Betreibers.

## Kontext

Der Import erzeugt für Fremd-Bausteine Stubs (`return null`). Der meist-
genutzte ist **Telegram Messenger** (Nachricht bei Ereignis aufs Handy).
Baue einen ECHTEN Baustein nach dem Fachwerk-SDK (`docs/BAUSTEIN-SDK.md`
lesen!): `bausteine/<id>/manifest.yaml` + `baustein.js` (plain JS, läuft in
der Sandbox). Clean-Room: NICHT den Original-LBS ansehen — die Telegram
Bot API ist öffentlich dokumentiert (api.telegram.org, sendMessage).

## Umfang

1. Beispiel-Gewerk `examples/bausteine-telegram/` (minimal: gewerk.yaml,
   1 Datenpunkt, 1 Logikseite) mit Baustein `telegram_nachricht`:
   - Parameter: `bot_token`, `chat_id`, `text` (Template: `{wert}` wird
     durch den Eingangswert ersetzt), `nur_bei` (optional: Wert-Filter).
   - Eingänge: `ausloeser` (Trigger), `wert` (optional, für den Text).
   - Ausgänge: `gesendet` (bool), `fehler` (text).
   - Versand mit `fetch` (Node-eingebaut, KEINE Dependency); Timeout 10 s;
     Fehler → Ausgang `fehler`, NIE Exception nach außen.
   - WICHTIG Sandbox: prüfe im SDK-Doc, ob/wie async erlaubt ist. Wenn die
     Sandbox synchron rechnet: Versand fire-and-forget über den erlaubten
     Mechanismus laut SDK; wenn gar nicht möglich → STOPP, im PR die
     Sandbox-Erweiterung als Frage an Spur 1 formulieren statt zu hacken.
2. Manifest-Testvektoren (`tests:` im Manifest — `fachwerk baustein test`
   muss laufen) für die REINE Logik (Text-Template, nur_bei-Filter);
   der HTTP-Versand wird über eine injizierbare URL getestet (Parameter
   `api_basis`, Default api.telegram.org — Test zeigt auf ungültigen Host
   und erwartet sauberen Fehler-Ausgang).
3. `docs/BAUSTEIN-SDK.md`: Abschnitt „Beispiel: Telegram" anfügen.

## Abnahme

1. Alle 4 Gates lokal grün; zusätzlich
   `node cli/src/main.ts baustein test examples/bausteine-telegram` grün und
   `node cli/src/main.ts validate examples/bausteine-telegram` OK.
2. Keine neuen Dependencies; kein Blick in Original-LBS-Code (Clean-Room).
3. Bot-Token NIEMALS im Repo — Beispiel nutzt Platzhalter `DEIN_BOT_TOKEN`.
4. Commits `BAUSTEIN:` nach AGENTS.md § 5; PR mit offenen Fragen.
