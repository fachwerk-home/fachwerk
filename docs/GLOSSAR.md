# Glossar (verbindliche Begriffe)

Präzise, konsistent verwendete Begriffe — für Menschen **und** Agenten. Bei Konflikt gilt
dieses Glossar. Doku/Specs sind deutsch; Code/Bezeichner englisch (Zuordnung in Klammern).

## Die zentrale Unterscheidung: Projekt vs. Gewerk

| Begriff | Bedeutung | NICHT verwechseln mit |
|---|---|---|
| **Projekt** | Das **Fachwerk-Softwareprojekt** selbst — dieses Git-Repository, an dem wir entwickeln. | dem, was EDOMI „Projekt" nennt |
| **Gewerk** | Eine **konfigurierte Gebäudesteuerung** in Fachwerk: die Gesamtheit aus Visuseiten, Logiken, Datenpunkten, Bausteinen, Archiven … für ein Haus/eine Anlage. Ein Fachwerk kann mehrere Gewerke verwalten; „aktiv" ist eines. | dem Fachwerk-**Projekt** (der Software) · einem einzelnen Teil-Gewerk im Bauhandwerk |

> Merksatz: **Wir** arbeiten an einem *Projekt* (Fachwerk). **Nutzer** bauen ein *Gewerk*
> (ihre Gebäudesteuerung). In EDOMI hieß „Gewerk" = „Projekt"; diesen Doppelbegriff lösen
> wir bewusst auf.
> Code-/API-Term für „Gewerk" (englisch) noch offen — Kandidaten: `site` / `installation`.
> Bis zur ADR: in deutschem Text „Gewerk".

## Weitere Kernbegriffe

| Begriff (DE) | Code/EN | Bedeutung |
|---|---|---|
| **Datenpunkt** | `datapoint` | Zentrale Abstraktion für Werte/Ereignisse zwischen Bus, Logik, Visu (SPEC-001). Entspricht EDOMIs „Kommunikationsobjekt/KO". Klassen: KNX-GA-gebunden, intern, System. |
| **Baustein** | `block` | Logik-Verarbeitungseinheit mit Ein-/Ausgängen (entspricht EDOMIs „Logikbaustein/LBS"). |
| **Logikseite** | `logic sheet` | Eine Fläche verdrahteter Bausteine. |
| **Visuseite** | `visu page` | Eine Visualisierungsseite mit Elementen. |
| **Treiber** | `driver` | Plugin zur Anbindung eines Protokolls/Systems (KNX, MQTT, Bridges …). |
| **Gewerk-Aktivierung** | `activation` | Übernahme von Änderungen in den Live-Betrieb (EDOMI: „Projektaktivierung", erzwingt Vollneustart — Fachwerk-Ziel: partiell/heiß, BACKLOG B-1). |
| **Ausführungs-Trace** | `trace` | Protokoll, welcher Baustein wann/warum mit welchen Werten lief (Plan § 3.2). |
| **Bus-Simulator** | `bus-simulator` | Fachwerks KNXnet/IP-Simulator für Dev/CI (SPEC-008, `tools/bus-simulator/`). |

Ergänzungen dieses Glossars per PR; neue Begriffe hier zuerst definieren, bevor sie in
Specs/Code auftauchen.
