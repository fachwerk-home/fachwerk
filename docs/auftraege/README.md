# Aufträge — Fahrplan zum Start-Abschluss (v1)

Stand 18.07.2026. Regeln: `AGENTS.md` (bindend). Jeder Auftrag ist
selbsttragend; ein Agent braucht KEINEN weiteren Gesprächskontext.

## Maintainer-Übergabe (Spur 1)

Die Spur-1-Rolle (Review, Merge, Integrations-Hotspots) ist NICHT an ein
bestimmtes Modell gebunden: **jede Claude-Code-Instanz (z. B. Opus) übernimmt
sie**, indem sie dieses Verzeichnis + `AGENTS.md` + `docs/PHASE-5-PLAN.md`
liest. Arbeitsverzeichnis von Spur 1 ist das Worktree
`..\fachwerk-spur1` (Branch `main`); vor jedem Push/gh-Vorgang:
`gh auth switch -u fachwerk-home`. Werkzeuge: portables Node+pnpm unter
`%USERPROFILE%\tools\node` (PATH voranstellen). Merge-Ritual je PR:

1. `git fetch origin` → Branch in einem Wegwerf-Worktree auschecken
2. Alle 4 Gates DORT ausführen (nicht dem PR glauben)
3. Diff gegen Dateibesitz des Auftrags prüfen (nichts Fremdes angefasst?)
4. Inhaltliches Review gegen die Abnahme-Liste des Auftrags
5. Kleinkram selbst fixen (eigener Commit auf dem Branch), Großes zurückgeben
6. `git merge --no-ff` auf main mit Review-Notiz, Gates auf main, push
7. Erledigte Schnitte im Plan abhaken; Integrationswünsche einlösen

## Dateibesitz ab Runde 3 (vereinfacht)

| Spur | Agent | Besitz |
|---|---|---|
| 1 | Claude/Opus (Maintainer) | `core/`, `cli/`, `schema/` (Schemata), `Dockerfile`, `.github/`, `tools/`, Compose, Merges |
| 2 | Codex | `ui/**` (komplett, inkl. admin) |
| 3 | Gemini | `importer/**`, `examples/` (nach Auftrag) |

`_ingest/` + `research/` bleiben exklusiv Spur 1.

## Reihenfolge & Abhängigkeiten

```
SOFORT parallel:
  P5-UI    (Codex)   Design-System v2 + Effizienz     — keine Abhängigkeit
  P5-13b   (Spur 1)  Archiv-Verdrahtung + /api/archive — keine
  TELEGRAM (Gemini)  Telegram-Baustein statt Stub      — keine

DANACH:
  P5-8     (Spur 1)  Schreibpfad + Audit               — nach 13b-Merge (API-Datei)
  P5-UI-B  (Codex)   Bedienen aktivieren + Diagramm    — nach P5-8 UND 13b
  P5-9     (Spur 1)  Visu-Import (braucht _ingest!)    — jederzeit; UI-Anschau nach P5-UI

ENDSPURT:
  P5-10a   (Spur 1)  Gewerk-Reload + write:gewerk      — nach P5-8
  P5-10    (Codex)   Visu-Editor v1                    — nach P5-10a + P5-UI
  P5-11    (Codex)   Logik-Editor v1                   — nach P5-10 (gleiche Infrastruktur)
  P5-12    (Spur 1)  Auth & Scopes + Härtung           — zuletzt
```

**Start-Abschluss (v1) erreicht, wenn:** eigene Visu importiert und auf
Panel + Handy bedienbar; Archive laufen auf und zeichnen; Monitor modern und
flott; Editoren für Visu + Logik nutzbar; Login/Scopes aktiv. Das ist die
Phase-5-Abnahme aus dem Plan.

## Auftragsliste

| Datei | Ausführender | Status |
|---|---|---|
| AUFTRAG-P5-6.md | Codex | ✅ gemergt |
| AUFTRAG-P5-13a.md | Gemini | ✅ gemergt |
| AUFTRAG-P5-7.md | Codex | ✅ gemergt |
| AUFTRAG-P5-13c.md | Gemini | ✅ gemergt |
| AUFTRAG-P5-UI.md | Codex | offen |
| AUFTRAG-P5-UI-B.md | Codex (nach P5-8 + 13b) | offen |
| AUFTRAG-P5-13b.md | Spur 1 (Opus) | offen |
| AUFTRAG-BAUSTEIN-TELEGRAM.md | Gemini | offen |
| AUFTRAG-P5-8.md | Spur 1 (Opus) | offen |
| AUFTRAG-P5-9.md | Spur 1 (Opus, mit Betreiber-Rückfragen) | offen |
| AUFTRAG-P5-10a.md | Spur 1 (Opus) | offen |
| AUFTRAG-P5-10.md | Codex | offen |
| AUFTRAG-P5-11.md | Codex | offen |
| AUFTRAG-P5-12.md | Spur 1 (Opus) | offen |
