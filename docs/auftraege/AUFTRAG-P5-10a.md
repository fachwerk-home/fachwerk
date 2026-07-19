# AUFTRAG P5-10a: Gewerk-Reload + write:gewerk-API (Spur 1)

- **Ausführender:** Maintainer (Claude/Opus). Voraussetzung: P5-8 gemergt
  (Token-Infrastruktur). Fundament für BEIDE Editoren (P5-10/P5-11).

## Umfang

1. **Reload im Prozess** (`cli/src/run.ts` + core): Funktion, die das
   Gewerk-Verzeichnis neu lädt und bei Erfolg atomar umschaltet:
   Engine-Snapshot sichern → neue Engine/Registry/Timer aus neuem Gewerk →
   remanente Werte + laufende Timer übernehmen (Persistenz-Schicht kann
   das: T-5) → Treiber-Zuordnungen neu aufbauen (KNX/MQTT-Verbindung
   BESTEHEN lassen — nur Mappings tauschen) → alte Engine stoppen.
   Bei Validierungsfehlern: alte Engine läuft unverändert weiter, Fehler
   als Antwort. Beobachtungsmodus-Flags überleben den Reload (heilig!).
2. **API:** `POST /api/gewerk/dateien` `{pfad, inhalt}` — schreibt EINE
   deklarative Datei ins Gewerk-Verzeichnis (nur relative Pfade unterhalb
   des Gewerks, Traversal-Schutz, nur .yaml/.js unter bekannten Ordnern;
   Scope-Gate wie P5-8). `POST /api/gewerk/aktivieren` — validiert alles,
   führt Reload aus, Antwort = Validierungsergebnis. `GET /api/gewerk/
   dateien/<pfad>` zum Lesen (für Editor-Roundtrip).
3. **WS-Event** `{art:"gewerk", ereignis:"aktiviert"|"fehler"}` an alle.
4. **Tests + E2E:** Reload unter Last (Simulator feuert während Reload);
   Timer-Übernahme (laufendes Treppenlicht überlebt Reload); kaputtes
   Gewerk → alte Logik läuft weiter. `tools/e2e-reload.sh` + CI.

## Abnahme

Gates + neue E2E grün · Reload < 2 s beim Referenz-Gewerk · Beobachtungs-
modus nachweislich unverändert nach Reload (Test).
