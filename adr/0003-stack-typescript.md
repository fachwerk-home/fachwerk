# ADR-0003: Stack — TypeScript end-to-end mit modularen Verträgen

- **Status:** Akzeptiert
- **Datum:** 2026-07-09
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)

## Kontext

Fachwerk (das Software-**Projekt**) baut eine Plattform, mit der Nutzer **Gewerke**
(konfigurierte Gebäudesteuerungen) erstellen. Kernwette: **Gewerk = deklarativer Text ·
Editor = Ansicht darauf · Agent-first · Web-UI** (Plan § 4.1). Randbedingungen:
- **Co-agentische Entwicklung** ist das Arbeitsmodell → Sprache muss von Coding-Agenten
  flüssig und zuverlässig produzierbar sein.
- Zielhardware: RasPi 4 / kleiner LXC (leichte Last: einige tausend Telegramme, Logik,
  Web-UI). **Kein** Hochleistungs-/Mikrocontroller-Bedarf.
- Langlebigkeit + Community-Beiträge.

Wichtige Entkopplung: Agenten, die ein **Gewerk bedienen**, reden über REST/MCP + die
Text-Dateien — für sie ist die Implementierungssprache **irrelevant**. Die Sprachwahl
betrifft nur, wie schnell/gut das **Projekt** selbst (co-agentisch) gebaut wird.

## Optionen

- **TypeScript end-to-end** (Node/Bun + TS-Frontend): eine Sprache, ein Schema über
  Backend/Frontend/Agenten-API. Deterministischer Single-Thread-Event-Loop passt zur
  ereignisgetriebenen Logik-Semantik (ADR-0005). Memory-safe (GC). Höherer RAM-/Startaufwand als
  Go, auf Zielhardware vertretbar. LLM-/Agenten-Fluss: am höchsten.
- **Go-Kern + TS-Frontend:** schlanker Daemon, eine statische Binary, starke Netz-/KNX-
  Schicht. Preis: zwei Sprachen, Schema/Validierung gespalten, schwächere „ein Modell"-
  Story. Agenten-Fluss: solide.
- **Rust-Kern + TS-Frontend:** Speichersicherheit ohne GC, minimaler Footprint, Embedded-
  fähig. Für unsere leichte Last überdimensioniert; Agenten-Fluss am geringsten (mehr
  Compile-Runden) → bremst co-agentische Entwicklung. TS ist ebenfalls speichersicher (GC),
  d. h. Rusts Sicherheits-Alleinstellung (ohne GC) bringt uns wenig.
- (Python ist Tooling-Sprache des Bus-Simulators, kein Kandidat für den Produktkern.)

## Entscheidung

**TypeScript end-to-end** als Implementierungssprache für Kern, Frontend und Agenten-API.
Runtime provisorisch **Node LTS** (Bun als Kandidat, separate Detailentscheidung).

Dazu verbindlich: **klare, sprachneutrale Verträge an den Modulgrenzen**, damit einzelne
Module später in anderen Sprachen reimplementiert/getauscht werden können, ohne den Kern zu
verändern:
1. **Treiber** (KNX, MQTT, Bridges) laufen hinter einem definierten Protokoll/Prozess-
   Interface (wie der Bus-Simulator es vormacht) → ein Rust/Go-Treiber kann einen TS-Treiber
   ersetzen.
2. **Gewerk-Daten** als sprachneutrales, schema-getriebenes Textformat (JSON/YAML +
   JSON-Schema) → jede Sprache und jeder Agent liest/schreibt dasselbe Modell.
3. **Rechenintensive/steckbare Teile** (Baustein-Laufzeit, ggf. KNX-Hotpath) über eine
   **WASM**-Schnittstelle → Community-Module in Rust/AssemblyScript etc. sind ohne
   Kern-Rewrite einsteckbar.

**Nicht** alles abstrahieren: Der Kern bleibt schlank und eher monolithisch (Tempo,
Kohärenz); stabile Verträge nur an den Nähten oben, wo Sprach-Tausch realistisch und
wertvoll ist.

## Konsequenzen

- Schnelle co-agentische Entwicklung + **ein Schema** über alle Schichten (stärkt
  Editor=Ansicht, Git-Historie/B-2, Agent-first).
- Höherer RAM-/Startbedarf als Go/Rust — auf RasPi 4/LXC bewusst akzeptiert.
- **Fluchtweg offen:** Rust/Go-Module später über Prozess-Protokoll (Treiber) bzw. WASM
  (Bausteine/Hotpath), ohne den Kern anzufassen. Coding-Agenten können ein einzelnes,
  vertrags­gebundenes Modul TS→Rust portieren, weil es klein und isoliert ist.
- **Hardware-Untergrenze:** kleiner Linux-Rechner (RasPi-4-Klasse). Fachwerk läuft **nicht**
  auf Mikrocontrollern (Arduino o. ä.) — in keiner Sprache; solche Geräte kommen höchstens
  als separate Edge-Knoten/Firmware ins verteilte Gesamtbild.
- Frontend-Framework, DB, KNX-Bibliothek: je eigene Folge-ADR.
