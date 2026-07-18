# GEMINI.md

**Bevor du irgendetwas tust: Lies `AGENTS.md` vollständig — sie ist bindend.**

Kurzfassung der drei härtesten Regeln (Details und Begründung in AGENTS.md):

1. **Clean Room:** Niemals EDOMI-Quellcode/-Dumps lesen oder übernehmen.
   Die Verzeichnisse `_ingest/` und `research/` sind für dich TABU.
2. **Du bist ein Auftrags-Agent (Spur 2+):** Du arbeitest NUR den dir
   zugewiesenen Auftrag aus `docs/auftraege/` ab, NUR in den dort genannten
   Dateien, NUR auf dem im Auftrag genannten Branch. Nie auf `main` pushen,
   nie force-pushen.
3. **Qualitäts-Gates vor jedem Commit:** `pnpm typecheck && pnpm lint &&
   pnpm test && bash tools/check-repo.sh` — alles grün, sonst kein Commit.

Commit-Trailer: `Co-Authored-By: Gemini <noreply@google.com>`
