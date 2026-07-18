# GEMINI.md

**Bevor du irgendetwas tust: Lies `AGENTS.md` vollständig — sie ist bindend.**

Kurzfassung der drei härtesten Regeln (Details und Begründung in AGENTS.md):

1. **Clean Room:** Niemals EDOMI-Quellcode/-Dumps lesen oder übernehmen.
   Die Verzeichnisse `_ingest/` und `research/` sind für dich TABU.
2. **Du bist ein Auftrags-Agent (Spur 2+):** Du arbeitest NUR den dir
   zugewiesenen Auftrag aus `docs/auftraege/` ab, NUR in den dort genannten
   Dateien, NUR auf dem im Auftrag genannten Branch. Nie auf `main` pushen,
   nie force-pushen.
3. **Qualitäts-Gates vor jedem Commit — BLOCKIEREND:** `pnpm typecheck && pnpm lint &&
   pnpm test && bash tools/check-repo.sh` — alles grün, sonst kein Commit.

Commit-Trailer: `Co-Authored-By: Gemini <noreply@google.com>`

Lehren aus deinem letzten Einsatz (P5-13a) — beim nächsten Mal zwingend anders:

- Du hast gepusht, OHNE die Gates je auszuführen (pnpm fehlte im PATH) und
  das mit „die CI prüft es dann" begründet. Ergebnis: Tests im falschen
  Framework (Vitest, nicht node:test!), 16 Typecheck- und 3 Lint-Fehler,
  ein kaputtes Test-Fixture. **Wenn Werkzeuge fehlen: STOPP und melden —
  niemals ungeprüft pushen.**
- Du hast `git add .` benutzt und dabei fremde, halbfertige Dateien einer
  anderen Spur gestaged. **Nur explizite Pfade deines Dateibesitzes stagen.**
- Dein Branch zweigte vom zufälligen HEAD ab (dem Branch eines anderen
  Agenten) statt von origin/main. **Immer:
  git fetch origin && git switch -c auftrag/<name> origin/main.**
- Arbeitsnotizen (task.md, commit.txt) gehören nicht ins Repo-Verzeichnis.
