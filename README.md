# Fachwerk

**Die freie Logik- und Visualisierungsplattform für KNX & mehr.**

Fachwerk ist eine Clean-Room-Neuentwicklung, inspiriert von den Konzepten, die EDOMI stark
gemacht haben — grafische Logikbausteine, pixelgenauer Visu-Editor, alles aus einem Guss —
neu gebaut auf modernem, offenem Fundament: Container-first, API-first, Agent-first.

> **Status: Phase 0 — Gründung.** Es gibt noch keinen lauffähigen Code.
> Fahrplan: [docs/ANALYSE-UND-PLAN.md](docs/ANALYSE-UND-PLAN.md) ·
> Community-Anforderungen: [docs/ANFORDERUNGEN-COMMUNITY.md](docs/ANFORDERUNGEN-COMMUNITY.md)

## Leitplanken

1. **Clean Room:** Fachwerk enthält keinen EDOMI-Code, keine EDOMI-Assets und keine daraus
   abgeleiteten Werke. Spezifiziert wird ausschließlich aus Nutzersicht (Black-Box) und aus
   öffentlichem Wissen. Details: [CONTRIBUTING.md](CONTRIBUTING.md).
2. **Frei, für immer:** AGPL-3.0, Urheberrecht bleibt bei den Contributors (DCO, kein CLA).
   Niemand kann dieses Projekt später „zusperren".
3. **Agent-first:** Projekte sind Textdateien (Git-diffbar), alles geht per API, ein
   MCP-Server ist Kernbestandteil — Coding-Agenten bauen Logiken und Visus ohne Friction.
4. **Sicher by default:** kein Port-Forwarding-Betriebsmodell, scoped Tokens,
   Human-in-the-loop-Deploy, geschützte Datenpunktklassen (Schlösser & Co. sind für
   Agenten tabu), Audit-Log.
5. **Die Grundbedienung läuft immer:** Fachwerk ergänzt die direkte KNX-Kommunikation
   zwischen Tastern und Aktoren — es ersetzt sie nie.

## Repo-Struktur

| Ordner | Inhalt |
|---|---|
| `specs/` | Funktionale Spezifikationen — die Quelle der Wahrheit |
| `adr/` | Architecture Decision Records |
| `core/` | Core-Server (KO-Engine, Logik, Visu-Server) — ab Phase 3 |
| `drivers/` | Treiber-Plugins (KNX, MQTT, Bridges) — ab Phase 3 |
| `ui/` | Admin-UI und Visu-Client — ab Phase 3 |
| `docs/` | Plan, Anforderungen, Betriebs-Doku |
| `tools/` | Entwicklungs- und CI-Werkzeuge |

## Namen & Marken

„EDOMI" ist ein Kennzeichen seines Autors; „KNX" ist eine eingetragene Marke der KNX
Association. Fachwerk steht mit beiden in keiner Verbindung und verwendet die Begriffe
ausschließlich beschreibend.

## Lizenz

[AGPL-3.0](LICENSE) © Fachwerk Contributors
