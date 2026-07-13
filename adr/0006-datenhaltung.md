# ADR-0006: Datenhaltung

- **Status:** Akzeptiert (2026-07-10)
- **Datum:** 2026-07-10
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)

## Kontext

EDOMIs zentrale MySQL-Abhängigkeit war eine dokumentierte Schwäche (Plan § 3.2; Community
wünscht „modernes Datenbank-Backend", DerSeppel ★). Fachwerk hat vier grundverschiedene
Datenarten, die EDOMI in einer DB vermischte:

1. **Gewerk-Definition** (Logiken, Visus, Datenpunkt-Definitionen …)
2. **Laufzeitzustand** (aktuelle/remanente Datenpunkt-Werte, Timer-Zustände)
3. **Zeitreihen/Archive** (Verläufe, Aggregationen — Community ersetzt EDOMI-Archive heute
   durch InfluxDB+Grafana)
4. **Traces/Logs** (Ausführungs-Traces E-5, Audit-Log § 4.2)

## Entscheidung

**Embedded-first: keine externe Datenbank als Voraussetzung.** Ein Fachwerk läuft
vollständig aus einem Verzeichnis + eingebetteter Storage — Installations- und
Backup-Einfachheit ist ein Kern-USP (EDOMI-Lehre).

1. **Gewerk-Definition → Git/Textdateien, NIE Datenbank** (ADR-0004). Die DB enthält
   keinerlei Definitionen — das erzwingt die „Editor = Ansicht"-Architektur.
2. **Laufzeitzustand → SQLite** (WAL-Modus), eine Datei je Gewerk. Remanente Werte werden
   transaktional bei Änderung persistiert (Crash-only-Design, Plan § 4.2); nicht-remanente
   nur im Speicher (SPEC-001 Remanenz-Flag).
3. **Zeitreihen → SQLite mit dediziertem Archiv-Schema** (append-only Tabellen, definierte
   Aggregations-/Retention-Jobs). Haushalts-Volumen (~10⁵–10⁷ Punkte/Jahr) ist für SQLite
   trivial. **Export als steckbare Publisher-Schnittstelle** (analog Treiber-Stufenpolitik
   ADR-0007 T-4): kein bestimmtes Fremdsystem im Core verdrahtet; InfluxDB/Prometheus sind
   naheliegende **erste Publisher-Pakete** (verbreitet, Forum-Befund Grafana-Nutzung),
   weitere folgen der Nachfrage. Kein Lock-in in unser Format, kein Lock-in in ein fremdes.
4. **Traces/Audit → JSONL-Ringdateien** (wie der Bus-Simulator es vormacht) mit
   Größen-/Zeit-Rotation; maschinenlesbar für Agenten (§ 4.1).

**Backup = Gewerk-Ordner + SQLite-Dateien** in einem Archiv — „Ein-Datei-Backup" wie bei
EDOMI geschätzt (SPEC-006), aber mit sauber getrennten Bestandteilen.

**Optional später:** Postgres als Alternative für Groß-Installationen — nur, wenn real
nachgefragt; kein Design um hypothetische Skalierung.

## Konsequenzen

- Kein DB-Server, keine Zugangsdaten, kein MySQL-Root wie bei EDOMI (dort sogar mit leerem
  Passwort, Beobachtung Basis-Konfiguration).
- Klare Zuständigkeiten: Git = Wahrheit der Definition; SQLite = Zustand/Historie;
  JSONL = Diagnose. Kein Vermischen.
- Restore-Semantik wird trivial erklärbar: Definition aus Git-Stand X + Zustand aus
  Snapshot Y.
- Offen: genaues Archiv-Schema (Aggregatstufen), Retention-Defaults, Export-Publisher-
  Auswahl (Folge-Spec zu SPEC-004).
