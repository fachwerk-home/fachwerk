# ADR-0009: API- & MCP-Oberfläche (Scopes, Aktivierungs-Workflow)

- **Status:** Akzeptiert (2026-07-10)
- **Datum:** 2026-07-10
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)

## Kontext

Agent-first (Plan § 4.1): alles, was die UI kann, kann die API; MCP-Server ist
Kernbestandteil. Guardrails (Plan § 4.2): Scopes statt Vertrauen, Human-in-the-loop-Deploy,
`protected`-Datenpunkte nie agenten-schreibbar, Audit-Log, Rate-Limits. Dazu B-5
(DEV/PROD-Umgebungen) und ADR-0004 (Gewerk = Text in Git): „Ändern" heißt Dateien
bearbeiten, „Deployen" heißt aktivieren.

## Entscheidung

### A-1: EINE API-Oberfläche — die UI ist nur ein Client
REST (Ressourcen/Operationen) + WebSocket (Live-Ereignisse: Datenpunkt-Werte, Traces,
Status). Die Admin-/Editor-UI benutzt **exakt dieselbe API** — keine privilegierten
Hintertüren. Damit ist API-Parität kein Versprechen, sondern Bauweise. Der **MCP-Server
ist ein dünner Adapter** über derselben API (Tools ↔ Endpunkte 1:1 nachvollziehbar).

### A-2: Ressourcenmodell
1. **Gewerk-Artefakte** (Dateien gem. ADR-0004) — lesen/schreiben im **Workspace** (DEV).
2. **Laufzeit** — Datenpunkt-Werte (lesen; schreiben nur mit `operate`), Treiber-Status,
   Traces/Logs, Archive.
3. **Operationen** — `validate` (headless, ohne Anlage), `diff/plan` (was würde sich
   ändern), `activate` (Gewerk-Aktivierung), `promote` (DEV→PROD, B-5), Simulator-Steuerung
   (nur DEV).

### A-3: Token-Scopes (additiv, minimal vergeben)
| Scope | erlaubt |
|---|---|
| `read` | Konfiguration + Laufzeit lesen, Traces/Archive lesen |
| `write:gewerk` | Artefakte im Workspace (DEV) ändern |
| `validate` | Validierung/Diff/Plan ausführen |
| `operate` | Datenpunkt-Werte schreiben — **niemals** `protected`-Klasse; rate-limitiert |
| `activate:dev` | Aktivierung in der DEV-Umgebung |
| `activate:prod` | Aktivierung/Promote nach PROD |
| `admin` | Nutzer/Token/Umgebungen/protected-Freigaben (interaktiv, 2FA) |

**Agenten-Default-Profil:** `read + write:gewerk + validate + activate:dev`.

### A-4: Aktivierungs-Politik je Umgebung (B-5 integriert)
- **DEV:** Aktivierung frei (auch für Agenten mit `activate:dev`) — schneller Edit-Test-
  Zyklus gegen Simulator/Schattenbus.
- **PROD:** Aktivierung/Promote erfordert **menschliche Freigabe** eines
  **Aktivierungsantrags**: Diff-Ansicht (Git), Validierungs-/Linter-Ergebnis,
  ggf. Simulations-Trace — Bestätigung in UI (oder signiert via CLI). Agenten können
  Anträge **stellen**, nie selbst freigeben. (Konfigurierbar, aber das ist der
  Auslieferungs-Default; Aufweichen ist eine bewusste Admin-Entscheidung.)
- Direkt-Edits in PROD durch Menschen bleiben möglich (B-5) — API erzwingt Commit +
  Rücksync-Hinweis Richtung DEV.

### A-5: `protected`-Datenpunkte: doppelt durchgesetzt
Sperre in der API-Schicht (kein Scope außer interaktivem `admin` schreibt protected) UND
in der Engine (Schreibpfad prüft Herkunft). Kein Token-Setup kann das aufheben —
Verteidigung in der Tiefe (Plan § 4.2).

### A-6: Audit & Limits
Jeder mutierende Aufruf landet append-only im Audit-Log: Identität (Mensch/Agent/Token),
Scope, Objekt, Diff-Referenz, Zeit — korrelierbar mit Ausführungs-Traces. `operate` ist
rate-limitiert (Telegramm-Sturm-Drossel + Anomalie-Alarm — Eindämmung, die klassische Engines vermissen lassen).

### A-7: MCP-Toolset v1 (dünn, 1:1 auf API)
`list_datapoints` · `read_datapoint` · `write_datapoint` (operate, non-protected) ·
`read_artifact`/`write_artifact` (Workspace) · `validate` · `plan_diff` ·
`activate` (dev) / `request_activation` (prod) · `read_trace`/`read_log` ·
`sim_*` (Simulator-Steuerung, nur DEV). Jedes Tool dokumentiert seinen benötigten Scope.

## Konsequenzen

- Agenten arbeiten first-class, aber im Leitplanken-Korridor: frei auf DEV, Antrag für
  PROD — deckungsgleich mit B-5 und § 4.2; die UI kann nichts, was die API nicht kann.
- MCP bleibt wartungsarm (dünner Adapter), Audit/Scopes leben in einer Schicht (API).
- Kosten: Antrags-/Freigabe-UX bauen; Scope-Granularität pflegen.
- Offen: Auth-Details (Token-Format, Passkeys für Admin), Mehrbenutzer-Rollenmodell,
  Remote-MCP-Transport (lokal vs. via VPN), Webhook-/Event-Abos für Fremdsysteme.
