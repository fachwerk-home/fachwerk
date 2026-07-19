# AUFTRAG P5-11: Logik-Editor v1 — Codex

- **Spur:** 2 (Codex) · **Branch:** `auftrag/p5-11-logik-editor`
- **Voraussetzungen gemergt:** P5-10 (Editor-Infrastruktur: Undo/Redo,
  Speichern/Aktivieren-Fluss). Regeln: `AGENTS.md`.
- **Dateibesitz:** `ui/**`. API-Wünsche → PR-Text.

## Ziel

Verdrahten im Browser: der Logik-Monitor (P5-5) wird editierbar.

## Pflichtlektüre

`specs/SPEC-002` (Ausführungsmodell, Trigger E-4), `adr/0012`
(konfig-variable Ports + introspizieren), `schema/src/index.ts`
(LogikSeite/Knoten/Kante — das Datenmodell), `ui/src/admin/logik.tsx`
(Monitor — Layout wiederverwenden), API `/api/gewerk` (Baustein-Manifeste)
+ P5-10a-Endpunkte.

## Umfang

1. **Aufbauend auf dem Monitor:** Editiermodus je Seite — Knoten aus
   Palette (Stdlib + eigene Bausteine aus `/api/gewerk`; Suche), Knoten
   verschieben (Layout bleibt Auto, aber manuelle Position als optionales
   Feld — API-Wunsch falls Schema-Erweiterung nötig: im PR klären!),
   Kanten ziehen von Port zu Port bzw. von/zu Datenpunkt-Pillen
   (Datenpunkt-Picker wie P5-10), Kante löschen, Trigger je Kante
   (on-change/on-receive) umschaltbar.
2. **Parameter-Formulare** aus dem Baustein-Manifest generiert; bei
   konfig-variablen Bausteinen (ADR-0012) Ports nach Parametrierung neu
   anzeigen.
3. **Validierung live:** vor dem Aktivieren die Seite über die API
   validieren lassen (falls es keinen Validierungs-Endpunkt gibt: als
   API-Wunsch an Spur 1 — `POST /api/gewerk/validieren` mit Datei-Inhalt);
   Zyklen/Mehrfach-Schreiber mit Ort anzeigen.
4. **Speichern/Aktivieren** wie P5-10 (kanonisches YAML, Roundtrip-Test).
5. **Stub-Knoten** bleiben markiert und sind verdrahtbar (nur ihr
   Verhalten fehlt) — Tooltip erklärt das.

## Abnahme

1. Alle 4 Gates + UI-Build grün (lokal).
2. Roundtrip-Test für Logik-YAML (laden→speichern diff-frei).
3. Handprobe im PR (GIF): die Licht-Status-Seite aus Bausteinen nachbauen
   → aktivieren → Simulator-Injektion läuft identisch durch (Monitor
   zeigt die Kaskade).
4. Absichtlicher Zyklus wird vor dem Aktivieren mit Ort gemeldet.
5. Commits `P5-11:`; PR mit Entscheidungen + API-Wünschen.
