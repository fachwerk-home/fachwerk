# AUFTRAG P5-13b: Archiv-Verdrahtung + /api/archive (Spur 1)

- **Ausführender:** Maintainer (Claude/Opus), direkt auf `main` (Spur-1-Recht),
  aber in sauberen Einzel-Commits mit grünen Gates.
- **Kontext:** `core/src/archiv/` (ArchivDienst, ladeArchive — P5-13a) ist
  fertig und getestet, aber nichts ruft ihn auf. Der Import erzeugt bereits
  `archiv/import.yaml` (19 Archive beim Betreiber).

## Umfang

1. **`cli/src/run.ts`:** Beim Start `ladeArchive(dir, gewerk.datenpunkte)`
   (Fehler = Warnungen, wie Visu); bei Archiven > 0 `ArchivDienst` öffnen
   (Datei `archiv.sqlite` unter FACHWERK_DATEN_DIR). `registry.abonniere`:
   bei Wertänderung eines Quell-DP → `erfasse(id, wert)`. Mapping
   Quelle→Archiv-IDs einmal beim Start bauen (ein DP kann mehrere Archive
   speisen). `raeumeAuf()` einmal beim Start + alle 6 h (Timer, im Shutdown
   aufräumen). `schliesse()` beim Shutdown.
2. **API (`core/src/api/handler.ts`):**
   - `/api/archive` → Liste (id, name, quelle, aufbewahrung_tage, anzahl
     Punkte gesamt — Zählabfrage in den Dienst ergänzen).
   - `/api/archive/<id>?von&bis&rasterS&aggregation` → `frage(...)`-Ergebnis.
     Defaults: bis=jetzt, von=bis−24 h, rasterS so, dass ≤ ~1000 Punkte
     rauskommen (grob rechnen). ApiKontext bekommt `archiv?: ArchivDienst`.
   - `/api/status`: Feld `archive: {anzahl}` ergänzen.
3. **Tests:** Handler-Tests mit In-Memory-Dienst; run-seitig deckt der E2E ab.
4. **E2E `tools/e2e-archiv.sh` + CI-Job:** Gewerk mit Archiv auf
   `wohnen.zaehler` (examples/minimal hat es schon), Simulator-Injektionen,
   dann `/api/archive/schaltzaehler` liefert Punkte; Container-Restart →
   Punkte noch da (Volume).

## Abnahme

Gates grün · E2E grün in CI · `/api/status` zeigt Archive · Doku-Absatz in
`specs/SPEC-004-archive.md` („Laufzeit-Verhalten") ergänzt.
