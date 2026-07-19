# AUFTRAG P5-12: Auth & Scopes (DEV-Niveau) + Härtung (Spur 1)

- **Ausführender:** Maintainer (Claude/Opus). ZULETZT im Phase-5-Plan —
  härtet alles davor. Voraussetzung: P5-8 und P5-10a gemergt.
- **Bezug:** ADR-0009 A-3/A-4. PROD-Freigabe-Workflow bleibt Phase 6.

## Umfang

1. **Nutzer & Login:** `nutzer.yaml` im Datenverzeichnis (NICHT im Gewerk):
   `{name: {hash, scopes[]}}`. Passwort-Hash mit `node:crypto` scrypt
   (KEINE Dependency — argon2 wäre ein natives Paket). CLI:
   `fachwerk nutzer anlegen <name>` (Passwort via stdin, nie argv).
   `POST /api/login` → Session-Token (zufällig, Ablauf 30 Tage, Ablage
   SQLite), Cookie HttpOnly+SameSite=Lax UND Bearer möglich (Agenten).
2. **Scopes durchsetzen:** `read` (GET/WS), `operate` (P5-8-POST),
   `write:gewerk` + `activate:dev` (P5-10a-Endpunkte). Statische Tokens
   via FACHWERK_API_TOKEN bekommen konfigurierbare Scopes
   (FACHWERK_API_TOKEN_SCOPES, Default read+operate) — Agent-first bleibt.
   protected-Datenpunkte sind über KEINEN Scope schreibbar (Test!).
3. **Härtung:** Security-Header (CSP für die eigene UI, nosniff,
   frame-ancestors), CORS bewusst AUS (gleiche Origin), Login-Rate-Limit
   (5/min/IP), Timing-sicherer Vergleich, Audit erweitert um nutzer/scope.
4. **UI-Anbindung minimal** (Login-Formular in der Admin-UI): als
   API-Vertrag dokumentieren; die hübsche Umsetzung macht Codex im
   Anschluss (kleiner Folge-PR auf ui/**).
5. **Scope-Matrix als Tabellen-Test** (jede Route × jeder Scope ×
   ohne Auth) — der Test IST die Doku.

## Abnahme

Gates grün · Scope-Matrix-Test vollständig · ohne Auth kein einziger
Schreibweg (E2E prüft POST-Wege mit 401/403) · SECURITY.md-Absatz
aktualisiert · Plan-Haken Phase 5 KOMPLETT.
