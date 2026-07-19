# AUFTRAG P5-UI-B: Bedienen aktivieren + Diagramm-Widget — Codex

- **Spur:** 2 (Codex) · **Branch:** `auftrag/p5-ui-bedienen-diagramm`
- **Voraussetzungen gemergt:** P5-8 (Schreibpfad) und P5-13b (/api/archive).
  Regeln: `AGENTS.md`. **Dateibesitz:** `ui/**`.

## Teil 1 — Bedienen im Visu-Client (P5-7 vervollständigen)

1. `set`-Rolle scharf schalten: Taster (sendet beim Druck), Schalter
   (umschalten), Slider (senden beim Loslassen, Anzeige folgt live),
   Aktionen `setze:`/`umschalten` aus dem Schema.
2. Schreiben via `POST /api/datenpunkte/<key>` (Statuscodes/Fehlerform
   siehe P5-8-Doku): 401/403 → Element bleibt deaktiviert mit Tooltip-
   Grund; `hinweis` („beobachten: nicht gesendet") als dezenter Toast.
3. **Optimistisches UI nur MINIMAL:** gedrückt-Zustand sofort, WERT erst
   wenn der WS ihn bestätigt (die Wahrheit kommt vom Kern).
4. Fehlende Rückmeldung (kein WS-Update in 3 s) → kurzer Warnhinweis.

## Teil 2 — Diagramm-Widget (SPEC-003 F-1 Tabelle B)

5. Widget `diagramm` im Renderer: Datenquelle = Archiv-ID (`parameter:
   {archiv, stunden}` — Schema hat den Platzhalter), lädt
   `/api/archive/<id>?von&bis&rasterS` passend zur Pixelbreite, zeichnet
   Linie als SVG (eigener Code, keine Chart-Lib!): Zeitachse mit
   Stunden-/Tagesticks, Y-Auto-Skala, Live-Nachführung (neuer WS-Wert der
   Quelle → Punkt anhängen), Grob-Zoom (24 h / 7 T / 30 T Umschalter),
   Tooltip bei Hover (Zeit + Wert).
6. Diagramm auch in der Admin-UI: neuer Sidebar-Punkt „Archive" — Liste
   aus `/api/archive`, Klick zeigt das Diagramm groß.

## Abnahme

1. Alle 4 Gates + UI-Build grün (lokal).
2. Handprobe im PR (GIF): Schalter im Visu-Client → Simulator empfängt
   (Compose-Stack, e2e-schreiben.sh aus P5-8 als Vorbild); Beobachtungs-
   modus → Toast statt Telegramm.
3. Diagramm rendert den Zähler-Verlauf aus e2e-archiv-Daten; Neustart des
   Containers → Verlauf weiter da.
4. Keine neuen Dependencies. Commits `P5-UI-B:`.
