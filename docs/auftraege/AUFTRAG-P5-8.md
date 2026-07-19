# AUFTRAG P5-8: Schreibpfad (API) + Audit (Spur 1)

- **Ausführender:** Maintainer (Claude/Opus). Nach P5-13b mergen/starten
  (gleiche Dateien `handler.ts`/`run.ts`).
- **Sicherheitskritisch — dreifach verriegelt, Tests beweisen jede Schicht.**

## Umfang

1. **`POST /api/datenpunkte/<schluessel>`** Body `{wert}`:
   - Nur mit Token (`FACHWERK_API_TOKEN`); ohne Token-Konfiguration ist der
     Schreibpfad KOMPLETT aus (403 mit Grund) — Lese-UI bleibt offen.
   - 403 bei `protected`-Datenpunkt (SPEC-001) — zusätzlich verweigert die
     Registry (zweite Schicht existiert).
   - Beobachtungsmodus: Schreiben in die Registry ERLAUBT (Logik reagiert),
     aber Treiber senden nie (dritte Schicht) — Antwort sagt das ehrlich:
     `{angenommen:true, hinweis:"beobachten: nicht auf den Bus gesendet"}`.
   - Typprüfung gegen die DP-Definition; 422 bei Mismatch.
   - **Rate-Limit** (ADR-0009 A-6 minimal): Token-weit N Schreibzugriffe/10 s
     (Default 30, Env FACHWERK_API_SCHREIBLIMIT) → 429.
2. **Audit:** append-only JSONL `audit.jsonl` in FACHWERK_DATEN_DIR:
   `{ts, schluessel, wert, quelle:"api", angenommen, grund?}` — auch
   abgelehnte Versuche. Keine Rotation in v1 (Hinweis in Doku).
3. **WS bleibt read-only** (Kommandos erst P5-11).
4. **UI-Vertrag dokumentieren** (für Codex' Teil B in AUFTRAG-P5-UI):
   kurzer Abschnitt in `docs/BEOBACHTUNGSMODUS.md` oder api-Kommentar —
   Statuscodes + Fehlerform.
5. **Tests:** Handler-Tests je Verriegelung (kein Token/protected/Typ/
   Limit/beobachten); E2E `tools/e2e-schreiben.sh` + CI: POST → Telegramm
   am Simulator (Normalmodus) UND Beobachtungsmodus → kein Telegramm,
   Audit wächst.

## Abnahme

Gates + neue E2E grün · Audit-Datei nachweislich append-only · Plan-Haken.
