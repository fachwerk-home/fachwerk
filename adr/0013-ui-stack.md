# ADR-0013: UI-Stack (Admin-UI & Visu-Client)

- **Status:** Akzeptiert (2026-07-18)
- **Datum:** 2026-07-18
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)
- **Bezug:** ADR-0003 (Stack TypeScript), ADR-0009 (API — UI ist nur Client),
  SPEC-003 (Visu/Editor), Plan § 4.1 (Agent-first), docs/PHASE-5-PLAN.md

## Kontext

Phase 5 liefert zwei Oberflächen auf **einer** API: die Admin-/Projektierungs-UI
(Monitor, Visu-Editor, Logik-Editor) und den Visu-Client (PWA für Panel/Handy).
Kräfte:

- **Agentenfreundlich (Plan § 4.1):** Ein Agent muss UI-Code zuverlässig
  schreiben können — das spricht für ein Framework mit sehr breiter, gut
  dokumentierter Verbreitung, nicht für eine Nische.
- **Klein & schnell:** Der Visu-Client läuft auf Wandpanels (schwache ARM-CPUs,
  alte Browser-Engines). Bundle-Größe und Renderkosten zählen real.
- **Langlebig:** Das Projekt soll Jahre laufen; ein Framework mit
  Breaking-Change-Kultur oder Vendor-Bindung wäre teuer.
- **Ein Prozess, ein Port (ADR-0009 A-1):** Die UI wird statisch aus dem
  fachwerk-Container ausgeliefert; kein zweiter Laufzeit-Dienst.
- **Null Laufzeit-Abhängigkeiten im Kern:** bleibt unangetastet — Build-Zeit-
  Werkzeuge der UI sind davon nicht betroffen.

## Optionen

- **React:** maximale Agenten-/Ökosystem-Kompetenz, aber ~45 kB und für ein
  Wandpanel unnötig schwer.
- **Svelte / SolidJS:** technisch exzellent, kleine Bundles — aber engeres
  Ökosystem und (v. a. Svelte-Runes-Umbrüche) mehr Bewegung; Agenten sind hier
  merklich schwächer als bei React-API.
- **Lit / Web Components:** standardnah, aber verbosere Zustands-/Datenfluss-
  Modelle; für Editoren mit viel State unangenehm.
- **Kein Framework (Vanilla + Templates):** minimal, aber Editoren mit
  komplexem Zustand von Hand zu bauen kostet später mehr, als es spart.
- **Preact + Vite (gewählt).**

## Entscheidung

### U-1: Preact (mit React-API) + TypeScript
Preact bietet die **React-API** — also genau die Programmierschnittstelle, die
Agenten und Menschen am besten beherrschen (Hooks, JSX, bekannte Muster) — bei
**~4 kB** statt ~45 kB. Kein Vendor-Lock: Preact ist eine unabhängige
Implementierung; bei Bedarf ist der Wechsel zu React über `preact/compat`
mechanisch möglich (Ausweg dokumentiert, nicht geplant).

### U-2: Vite als Build- und Dev-Werkzeug
Vite liefert Dev-Server mit HMR, TS-Unterstützung und einen kleinen
Produktions-Build. Der Dev-Server **proxyt `/api`** auf den laufenden
fachwerk-Prozess (Default `http://localhost:8300`), damit UI-Entwicklung gegen
echte Daten läuft.

### U-3: Ein Workspace-Paket `@fachwerk/ui` unter `ui/`
Beide Oberflächen leben in einem Paket mit gemeinsamen Bausteinen
(API-Client, WS-Client, Formatierung nach ADR-0011, Design-Tokens) und zwei
Einstiegspunkten: `admin` und `visu`. Ein Paket, weil sie sich Datenmodell und
Renderer-Teile teilen; getrennte Einstiegspunkte, weil der Visu-Client klein
bleiben muss (der Editor-Code darf nicht ins Panel-Bundle).

### U-4: Statische Auslieferung aus dem Kern-Prozess
`pnpm --filter @fachwerk/ui build` erzeugt statische Dateien; das Docker-Image
enthält sie, der HTTP-Server (P5-2) liefert sie neben `/api` aus — **ein Port,
ein Prozess, kein Reverse-Proxy nötig**. Fehlt der Build (reine
Entwicklungsumgebung), läuft der Kern unverändert weiter (nur ohne UI).

### U-5: Styling ohne UI-Kit
Plain CSS mit **CSS Custom Properties** als Design-Tokens (Farben, Abstände,
Schrift), Dark/Light über `prefers-color-scheme`. Kein Tailwind/MUI/Bootstrap:
Ein UI-Kit prägt Optik und Update-Zyklus des Projekts stärker, als uns lieb ist
— und die Visu bringt ihr Aussehen ohnehin aus Design-Vorlagen (SPEC-003 R-4)
mit, nicht aus einem Framework-Theme.

### U-6: Keine Abhängigkeit ohne Anlass
Zusätzliche UI-Bibliotheken (Graph-Layout, Diagramme) werden **je Schnitt
einzeln** entschieden und begründet; Default ist Eigenbau, wenn der Aufwand
klein und die Abhängigkeit groß wäre. Charts/Graphlayout sind die einzigen
absehbaren Kandidaten.

## Konsequenzen

- **Agenten können die UI bauen:** React-API ist der bestdokumentierte
  Frontend-Dialekt; Preact ändert daran nichts Wesentliches.
- **Panel-tauglich:** ~4 kB Framework + getrenntes Visu-Bundle halten den
  Client leicht.
- **Betrieb bleibt einfach:** ein Container, ein Port; die UI ist ein
  Build-Artefakt, kein Dienst.
- **Kosten/Risiken:** Preact-Eigenheiten bei exotischen React-Bibliotheken
  (`preact/compat` nötig) — deshalb U-6 (wenig Fremdcode). Zwei
  Einstiegspunkte erfordern etwas Build-Konfiguration.
- **Berührt:** Dockerfile (UI-Build-Stufe), CI (UI bauen), ADR-0009
  (Auslieferung durch denselben Server).
