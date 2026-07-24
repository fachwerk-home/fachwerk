# AUFTRAG API-VISU-DATEIEN: Beilagen auflisten (Spur 1/Opus, klein)

- **Ausführender:** Maintainer, direkt auf main. Antwort auf den eigenen
  Integrationswunsch aus VISU-SCHRIFTEN: **ja, nachziehen.**

## Umfang

`GET /api/visu/dateien` → `{dateien: [{name, groesse, art}]}` — Inhalt von
`visu/dateien/` (ADR-0015 D-1), `art` grob aus der Endung (schrift|bild|
sonstiges). Gleiche Regeln wie D-3: Scope `read`, kein Pfad-Ausbruch,
leeres/fehlendes Verzeichnis ⇒ leere Liste. Handler-Test + Zeile in der
API-Doku. Codex' Font-Code muss damit keine Endungen raten
(`.ttf`/`.otf`/`.woff2`-Probieren entfällt).

## Abnahme

Gates grün · Handler-Test (mit/ohne Verzeichnis, Traversal-Versuch 400) ·
Codex im VISU-SCHRIFTEN-PR informiert, falls dort noch geraten wird.
