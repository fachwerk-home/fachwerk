# AUFTRAG ADR14-V3: Hash-Pinning + Netz-schreibt-nie-protected (Spur 1/Opus)

- **Ausführender:** Maintainer, direkt auf main. ADR-0014 nennt V-3 selbst
  „billig nachzurüsten und der nächste sinnvolle Schritt" — vor dem
  Start-Abschluss einlösen, danach ist ADR-0014 bis auf V-4 (terminiert
  Phase 6/7) abgeschlossen.

## Umfang

1. **Harte Regel zuerst (wichtigster Teil):** Ein Baustein mit
   `netz`-Capability darf NIE einen `protected`-Datenpunkt schreiben —
   Durchsetzung in der Engine (nicht nur Registry): Schreibversuch wird
   abgelehnt, im Trace als Fehler sichtbar, Warnung beim Start, wenn ein
   solcher Baustein im Graph auf einen protected-DP verdrahtet ist
   (statische Analyse, wie E-6/E-7-Meldungen). Tests: Verdrahtung → Warnung;
   Laufzeit-Schreibversuch → abgelehnt + Trace.
2. **Hash-Pinning:** `gewerk.yaml` (oder `bausteine/pins.yaml` — Entscheidung
   dokumentieren) hält je eigenem Baustein `sha256` über manifest.yaml +
   baustein.js. `fachwerk run`/`validate`: Abweichung ⇒ Startverweigerung
   mit klarer Meldung; fehlender Pin ⇒ Warnung mit dem berechneten Hash zum
   Eintragen (Migrationspfad für Bestands-Gewerke). CLI-Helfer
   `fachwerk baustein pin <verzeichnis>` schreibt/aktualisiert die Pins.
3. **Herkunftsstufen** nur als Feld (`herkunft: eigen|community|unverifiziert`,
   Default eigen) + Anzeige im Startlog und in `/api/gewerk` — die
   Registry-Anbindung selbst bleibt Phase 6/7.
4. ADR-0014-Umsetzungsstand aktualisieren.

## Abnahme

Gates grün · Test: manipulierter baustein.js ⇒ Startverweigerung ·
Scope-/Trace-Beweis für Regel 1 · MIGRATION-/Doku-Hinweis, wie Betreiber
Pins initial erzeugen.
