# AUFTRAG P5-10: Visu-Editor v1 (WYSIWYG) — Codex

- **Spur:** 2 (Codex) · **Branch:** `auftrag/p5-10-visu-editor`
- **Voraussetzungen gemergt:** P5-UI (Design-System v2), P5-10a
  (write:gewerk-API + Reload). Regeln: `AGENTS.md`.
- **Dateibesitz:** `ui/**`. API-Wünsche → PR-Text (Spur 1 baut nach).

## Ziel

Der Editor, der das Referenzsystem ausgezeichnet hat — modern (SPEC-003
R-1/R-2/R-7): Seiten pixelgenau im Browser bauen, speichern als
deklaratives YAML über die API, aktivieren ohne Neustart.

## Pflichtlektüre

`adr/0010` (L-1..L-5!), `adr/0011`, `specs/SPEC-003` (R-1..R-11, F-1),
`schema/src/visu.ts` (das ist das Datenmodell — der Editor ist NUR eine
Ansicht darauf, R-5), API: `GET/POST /api/gewerk/dateien`,
`POST /api/gewerk/aktivieren` (P5-10a), dein Renderer aus P5-7
(Wiederverwendung: Editor-Canvas = Renderer + Overlay).

## Umfang

1. **Canvas:** dritter Einstieg NICHT nötig — Editor als Modus der
   Admin-UI (neuer Sidebar-Punkt „Visu-Editor"). Renderer rendert die
   Seite; darüber Auswahl-Overlay: Klick wählt, Drag verschiebt, Griffe
   skalieren, Raster/Snap (xgrid konfigurierbar), Mehrfachauswahl
   (Shift/Rahmen), Ausrichten-Knöpfe, Duplizieren, Löschen, Undo/Redo
   (Editor-lokal, Zustandstack).
2. **Palette:** Presets + Widgets aus F-1 als Kacheln; Drag auf die
   Leinwand erzeugt Element mit sinnvollen Defaults.
3. **Eigenschaften-Panel** (R-7 Progressive Disclosure): die ~5 häufigsten
   Felder sofort (Bindungen nach Rollen, Design, Text, Aktion), Rest unter
   „Erweitert". **Datenpunkt-Picker** = Suchfeld über `/api/datenpunkte`.
4. **Breakpoints (L-2/L-4):** Umschalter Basis/weitere; Elemente ohne
   eigenes Placement erscheinen als „geerbt" (halbtransparent), erster
   Drag materialisiert das Placement; `sichtbar:false` schaltbar.
5. **Speichern/Aktivieren:** Serialisierung EXAKT ins P5-6-Schema
   (Roundtrip-stabil: laden→speichern ohne Diff — Test!); „Speichern"
   schreibt via API, „Aktivieren" ruft aktivieren auf und zeigt das
   Validierungsergebnis; Fehler der API verständlich anzeigen.
6. **Sicherheit:** ohne Token ist der Editor read-only (API lehnt ab —
   UI zeigt das ehrlich, statt Buttons ins Leere laufen zu lassen).

## Abnahme

1. Alle 4 Gates + UI-Build grün (lokal).
2. Roundtrip-Test: Beispielseite laden → unverändert speichern → YAML
   byte-identisch (kanonisch, kleine Diffs — ADR-0004).
3. Handprobe (im PR mit Screenshots/GIF): neue Seite bauen (Schalter +
   Wertanzeige + Navigation), speichern, aktivieren, im Visu-Client
   bedienbar — ohne Container-Restart.
4. Keine neuen Dependencies; Undo/Redo funktioniert für Verschieben,
   Skalieren, Anlegen, Löschen.
5. Commits `P5-10:`; PR mit Entscheidungen + API-Wünschen.
