# AUFTRAG BAUSTEIN-WETTER: Wetter-Baustein statt der zwei WU-Stubs (Gemini)

- **Spur:** 3 (Gemini) · **Branch:** `auftrag/baustein-wetter`
- **Arbeitsablauf:** EXAKT wie AUFTRAG-P5-13c.md § Arbeitsablauf (Worktree
  von origin/main, PATH-Prüfung, Gates BLOCKIEREND, git add nur eigene
  Pfade). Regeln: `AGENTS.md` + `GEMINI.md`.
- **Dateibesitz:** `examples/bausteine-wetter/**` (neu) und
  `docs/BAUSTEIN-SDK.md` (nur Abschnitt anfügen). Tabu: alles andere.

## Kontext

Die Migrations-Liste des Referenz-Imports enthält zwei Wetter-Stubs
(„Weather Underground APIv3", aktuell + 5 Tage). Fachwerk ersetzt sie durch
EINEN nativen Wetter-Baustein nach dem Telegram-Muster (ADR-0014: Manifest-
`capabilities.netz`, Versand/Abruf ausschließlich über `ctx.netz.hole`,
Antwort kommt als eigene Kaskade). Clean-Room: NICHT die alten LBS ansehen —
nur die öffentliche API-Doku des Wetterdienstes.

**Dienst-Entscheidung (vom Betreiber vorentschieden): Open-Meteo**
(api.open-meteo.com — frei, ohne API-Key, JSON). Eine WU-APIv3-Variante wird
NICHT gebaut; wer WU will, sagt es später mit Key.

## Umfang

1. Beispiel-Gewerk `examples/bausteine-wetter/` mit Baustein `wetter`:
   - Parameter: `breite`, `laenge` (Koordinaten), `intervall_min`
     (Default 30, min 15 — Fair-Use), `tage` (0–7, Default 3).
   - Eingang: `abruf` (Trigger für Sofort-Abruf; zyklischer Abruf über
     `ctx`-Timer gemäß intervall_min).
   - Ausgänge aktuell: `temperatur`, `gefuehlt`, `luftfeuchte`, `wind_kmh`,
     `windrichtung`, `niederschlag_mm`, `wettercode`, `ist_tag`; je
     Vorhersagetag n (1..tage): `tag<n>_max`, `tag<n>_min`,
     `tag<n>_niederschlag_mm`, `tag<n>_wettercode`; dazu `fehler` (text)
     und `stand` (Unix-ts des letzten erfolgreichen Abrufs).
     Ports snake_case (Schema!); konfig-variabel nach ADR-0012
     (`ports(parameter)` — Zahl der Tages-Ports folgt aus `tage`).
   - `capabilities: {netz: [api.open-meteo.com]}`; Fehler (Timeout, kaputtes
     JSON) → Ausgang `fehler`, nie Exception.
2. Manifest-Testvektoren für die reine Logik (JSON→Ausgänge-Mapping mit
   eingefrorenem Beispiel-JSON als Parameter/Fixture; Fehlerpfad). Der
   HTTP-Weg selbst ist durch die ctx.netz-Infrastruktur des Kerns getestet.
3. `docs/BAUSTEIN-SDK.md`: Abschnitt „Beispiel: Wetter (zyklischer Abruf)"
   anfügen — inkl. wie man die WMO-`wettercode`-Werte in der Visu per
   `enum_map` beschriftet.

## Abnahme

1. Alle 4 Gates lokal grün; `fachwerk baustein test` und `validate` auf dem
   Beispiel-Gewerk grün.
2. Keine neuen Dependencies; kein Blick in Alt-LBS (Clean-Room); kein
   API-Key nötig.
3. PR-Beschreibung: Ausgänge-Tabelle, offene Fragen, Hinweis für die
   MIGRATION.md-Nutzer (die zwei Stubs manuell durch `wetter` ersetzen —
   automatisches Umverdrahten ist bewusst NICHT Teil des Auftrags).
