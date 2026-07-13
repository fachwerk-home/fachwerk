# Analyse & Projektplan: Eine freie EDOMI-Nachfolge (Arbeitstitel: „Projekt Fachwerk")

> Stand: 2026-07-08 · Status: Entwurf / Gründungsdokument
> Hinweis: Dieses Dokument enthält eine rechtliche Einschätzung nach bestem Wissen, ersetzt aber keine anwaltliche Beratung. Vor der ersten **Veröffentlichung** sollte ein Anwalt für Urheber-/IT-Recht kurz drüberschauen.

---

## 1. Ausgangslage

- EDOMI (zuletzt v2.03.x) ist eine geniale, aber gealterte KNX-Logik- und Visualisierungsplattform: CentOS 7 (EOL seit 06/2024), PHP 5.x-Ära, teils bcompiler-kompilierte Komponenten, Adobe-Flash-Historie im Editor-Umfeld, monolithische Architektur.
- Der Entwickler (C. Gärtner) hat sich zurückgezogen, die Website und Tutorials entfernt und einer Weiterführung/Veröffentlichung durch Dritte **ausdrücklich widersprochen** (dokumentiert im Thread „Quo vadis Edomi" im KNX-User-Forum, Mai 2024).
- EDOMI ist **proprietäre Freeware** (Nutzung privat gestattet, keine Modifikation, keine Weitergabe, keine kommerzielle Nutzung). Es ist **kein** Open-Source-Projekt — ein Fork des Codes ist damit ausgeschlossen.

### 1.1 Umfeldanalyse: Was die Community bereits versucht hat (Forum-Recherche, Stand 07/2026)

Auswertung des Threads „Quo vadis Edomi" (22 Seiten), „EDOMI-LTS – future development", „Schwieriger Umstieg von Edomi zu Home Assistant" u. a.:

- **EDOMI-LTS** (GitHub: SmarthomeIndia/EDOMI-LTS): einziger echter Fork-Versuch — basiert auf dem 2.03-Code, damit **rechtlich unzulässig** (im Forum selbst so diskutiert), faktisch eingeschlafen. Bestätigt: Der Fork-Weg ist eine Sackgasse.
- **starwarsfan (Yves)**: pflegt Docker-Images und LXC-/VM-Templates (Rocky 8) für den Weiterbetrieb (edomi-docker, edomi-lxc). Grenze: Rocky 9/PHP 8 bräuchte Code-Refactoring, das die Lizenz verbietet.
- **„OpenEdomi" / „freeDOMI" / „Edomi NG"**: mehrfach diskutierte Neuentwicklungs-Ideen (scw2wi, mfd, rdeckard, Dez. 2025/2026) — **kein einziges Projekt wurde je gestartet**. Zitat rdeckard: „JEDER hier hat eine andere Vorstellung, wie ein Edomi-Nachfolger sein müsste."
- **C.A.F.E.** (cafe-hass, Beta): grafischer „Complex Automation Flow Editor" für Home Assistant — die konkreteste Umsetzung der Idee „EDOMI-Logikeditor woanders", aber an HA gebunden.
- **LBS-Szene lebt**: sipiyou veröffentlicht 2025/2026 weiter neue Bausteine (Modbus-TCP, MQTT). Andere Autoren ziehen sich zurück: jonofe gibt seine MQTT-LBS nur noch auf Anfrage heraus; philipp900 darf seine native MQTT-Implementierung wegen der Lizenz nicht veröffentlichen.
- **Migrationstools: Fehlanzeige.** Es existiert kein Tool, das EDOMI-Visus/Logiken/LBS irgendwohin konvertiert. Nur ETS→HA-Konverter (knx2ha.com, 06/2026 eingestellt; ets-to-homeassistant). Migration läuft durchgängig manuell über MQTT-Parallelbetrieb.
- **Stimmungsbild**: überwiegend skeptisch („Ressourcen fehlen", „Zug ist abgefahren"), aber der Wunsch nach den EDOMI-USPs (pixelgenauer Editor, Logikmaschine, Alles-in-einem) zieht sich durch alle Threads. Frühere Anläufe scheiterten laut Forum weniger an Technik als an **Governance und zwischenmenschlichen Konflikten**.

**Konsequenzen für dieses Projekt:**
1. Das Feld ist frei — niemand hat den Clean-Room-Weg beschritten; alle Versuche waren Fork (illegal) oder Diskussion (nie gestartet).
2. Es gibt potenzielle Mitstreiter mit fertigen, aber „eingesperrten" Beiträgen (philipp900/MQTT, LBS-Autoren wie sipiyou, Infrastruktur-Know-how von starwarsfan) — ein legales Zuhause mit klarer Lizenz löst genau deren Problem.
3. Governance ist kein Nice-to-have: klare Maintainer-Struktur, ADR-Prozess und ein arbeitsfähiger Kern vor dem großen Community-Aufruf (erst zeigen, dann einladen — MVP vor Ankündigung).

### 1.2 Stärken-Mining: Home Assistant und FHEM

Beide Systeme sind keine Vorbilder fürs Ganze, aber Steinbrüche für einzelne Stärken:

**FHEM — was übernehmen:**
- **Niedrigschwellige Modul-API:** Das riesige Protokoll-Ökosystem (EnOcean, Hue, Homematic, Z-Wave, 1-Wire …) existiert, weil ein Community-Modul in einer Datei schreibbar ist. Lehre: Der Fachwerk-Treiber- und Baustein-SDK muss so einstiegsfreundlich sein wie ein FHEM-Modul oder ein EDOMI-LBS — das ist die Wachstumsbedingung des Ökosystems.
- **Alles ist Text + API:** Konfiguration als Textdatei, Telnet-/HTTP-API für alles — deckungsgleich mit unserem Agent-first-Prinzip (4.1).
- **Einheitliches Geräte-/Readings-Modell:** Jedes Gerät hat Readings und feuert Events; generische Primitive (notify, at) arbeiten darauf. Vorbild für das Fachwerk-Datenpunktmodell über KNX hinaus.
- Genügsam, lokal, kein Cloud-Zwang.

**FHEM — was vermeiden:** UI-Zustand (abschreckend für Neueinsteiger), ein blockierender Perl-Monolith (ein hängendes Modul bremst alles — darum: Treiber- und LBS-Isolation in Fachwerk), Doku-Wildwuchs.

**Home Assistant — was übernehmen:**
- **Automation-Traces:** HA zeigt pro Automationslauf nachvollziehbar, welcher Schritt wann mit welchen Werten lief. Genau das fehlt EDOMI (siehe 3.2, Ausführungstransparenz) — Ausführungs-Traces werden Kernfeature der Fachwerk-Logik-Engine.
- **Entity-/Device-/Area-Registry und Discovery:** strukturierte Gerätesemantik statt roher Adressen.
- **Verteilungsmodell:** Add-on-Store/HACS zeigen, wie Community-Erweiterungen installierbar sein müssen (ein Klick, versioniert) — Vorbild für die Baustein-Registry.
- Mobile Apps/PWA-Reife als Messlatte für den Visu-Client.

**Home Assistant — was vermeiden:** Split-Brain zwischen YAML und UI-Konfiguration (Fachwerk: *ein* Format, Editor ist nur Ansicht), Breaking-Changes-Kadenz (Fachwerk: semver, stabile Projektdateiformate), Logik verstreut über Automationen/Skripte/Helfer ohne grafische Gesamtsicht, keine pixelgenaue Visu.

**Brücken statt Nachbau:** Fachwerk muss nicht jedes Protokoll selbst können. Ein erstklassiger MQTT-Treiber plus dedizierte Bridges (HA-WebSocket-API, FHEM via MQTT/FHEMWEB) machen vorhandene Installationen sofort zu Geräte-Providern — konkret: deine EnOcean- und Hue-Anbindung bleibt in FHEM und erscheint trotzdem als Fachwerk-Datenpunkte. Protokollbreite ab Tag 1, native Treiber nur dort, wo es sich lohnt (KNX zuerst).

## 2. Rechtliche Analyse: Was geht, was geht nicht

### 2.1 Nicht erlaubt (rote Linien)

| Verboten | Warum |
|---|---|
| EDOMI-Quellcode (auch Fragmente) in das neue Projekt übernehmen | Urheberrecht, Lizenz verbietet Modifikation/Weitergabe |
| bcompiler-/verschlüsselte Teile dekompilieren, um daraus Code zu gewinnen | § 69e UrhG erlaubt Dekompilierung nur eng begrenzt für Interoperabilität, nicht für Nachbau |
| Grafiken, Icons, Sounds, Doku-Texte, Hilfetexte übernehmen | Eigenständig urheberrechtlich geschützt |
| Den Namen „EDOMI" im Produktnamen verwenden (auch „EDOMI CE") | Namens-/Kennzeichenrecht, wettbewerbsrechtliches Risiko, klarer Wille des Autors |
| EDOMI-Code lesen und „aus dem Kopf" nachprogrammieren | Kontaminiert den Clean-Room; Risiko einer unfreien Bearbeitung (§ 23 UrhG) |
| Community-LBS (Logikbausteine) pauschal übernehmen | Jeder LBS hat einen eigenen Autor/eigene Rechte |

### 2.2 Erlaubt (grüne Zone)

| Erlaubt | Grundlage |
|---|---|
| **Ideen, Konzepte, Funktionsprinzipien** nachbauen (Logikmaschine, KO-Modell, LBS-Konzept, Visu-Seiten, Archive, Live-Projektierung) | § 69a Abs. 2 UrhG: Ideen und Grundsätze sind nicht geschützt |
| **Black-Box-Beobachtung** des laufenden Systems (Verhalten, Abläufe, UI-Flows als Funktionsbeschreibung) | Beobachten des Programmablaufs durch berechtigten Nutzer ist zulässig (§ 69d Abs. 3 UrhG) |
| **Eigene Projektdaten** aus der eigenen Installation exportieren (GAs, KO-Listen, Seitenstruktur, Archivdaten) | Deine Konfigurationsdaten sind deine Daten |
| Schnittstellen-/Format-Kompatibilität für Migration eigener Daten | Interoperabilität; Datenformate sind i. d. R. nicht schutzfähig |
| Öffentliches Wissen nutzen: Forum-Threads, öffentlich verfügbare Doku-Inhalte als *Wissensquelle* (nicht als Kopiervorlage) | Fakten/Wissen sind frei, Formulierungen nicht |
| „Kompatibel zu EDOMI-Konzepten" als *beschreibende* Aussage in der Doku | Beschreibende Nennung ist zulässig — aber nicht im Produktnamen |

### 2.3 Konsequenz: Clean-Room-Reimplementierung

Das Projekt wird ein **von Grund auf neues System** mit neuem Namen, neuem Code, neuem Design und moderner Architektur, das die *Konzepte* übernimmt, die EDOMI stark gemacht haben. Der formale Prozess:

1. **Spezifikationsebene:** Verhalten von EDOMI wird als funktionale Spezifikation dokumentiert — ausschließlich aus Nutzersicht (Black-Box: bedienen, beobachten, testen) und aus öffentlichem Wissen. **Niemals aus dem Quellcode.**
2. **Implementierungsebene:** Entwickelt wird ausschließlich gegen diese Spezifikationen.
3. **Provenienz-Regel im Repo:** Jeder Beitrag bestätigt (DCO/`Signed-off-by`), dass kein EDOMI-Code/Asset verwendet wurde. Die DEV-LXC dient nur als Referenzsystem für Verhaltensbeobachtung und als Quelle *deiner eigenen* Projektdaten — nicht als Codequelle.

> **Wichtig für unsere Zusammenarbeit:** Ich werde daher **keinen Quellcode aus der DEV-LXC beziehen oder lesen**. Was ich mit der LXC sehr wohl tun kann: HTTP-Verhalten beobachten, Abläufe testen, deine Projektdaten exportieren, Screenshots als Funktionsreferenz auswerten (Funktionalität, nicht Pixel-Nachbau).

### 2.4 Namenswahl ist Schritt 1, nicht Schritt 2

Da der Name in Repo-Namen, Namespaces, Paketnamen, Config-Pfaden und Doku landet, sollte er **vor** dem ersten Commit feststehen. Kriterien: keine Verwechslungsgefahr mit „EDOMI", keine Kollision mit eingetragenen Marken im Elektro-/Automationsumfeld, Domain/GitHub-Org frei, international aussprechbar, gut suchbar (nicht generisch).

**Entscheidung (07/2026): Arbeitsname ist „Fachwerk"** (Repo/Namespace: `fachwerk`). Der frühere Platzhalter „Phoenix" wurde verworfen — abgenutzt und konkret riskant, weil Phoenix Contact eine der größten deutschen Marken genau im Elektrotechnik-/Automatisierungsumfeld ist. Vor der **Veröffentlichung** (Phase 7) steht noch der formale Check aus: DPMA/EUIPO Nizza-Klassen 9/42, Domains, GitHub-Org.

Damals geprüftes Kandidaten-Brainstorming (Archiv):
- **Domovoi / Domovik** — slawischer Hausgeist, der über das Haus wacht; „dom"-Wurzel klingt vertraut, ohne EDOMI zu imitieren (Abgrenzung zu Domoticz prüfen)
- **Lares** — römische Schutzgeister des Hauses (Kollision: Ksenia „lares" Alarmsysteme — prüfen, evtl. Variante „Laren")
- **Kardo** — lat. cardo = Türangel, Dreh- und Angelpunkt; kurz, technisch, kaum besetzt
- **Fachwerk** — deutsches Wort, international als Begriff bekannt, Haus-Struktur-Metapher. Bekannte Kollisionen (beide schwach, andere Domäne): designstem/fachwerk (JS-Lern-Framework, inaktiv), „Fachwerk Software" (Firma hinter dem Weave-Microservice-Framework). Vor Festlegung DPMA/EUIPO prüfen.
- **Herdfeuer-/Wächter-Kreis** (Vesta, Heimdall …) — meist stark abgenutzt, eher meiden

**Warnung zu KNX-Anspielungen im Namen („fachwerK-NX", „…^NX" u. ä.):** „KNX" ist eine eingetragene und aktiv verteidigte Marke der KNX Association; Namens- und Logonutzung ist an Mitgliedschaft/Zertifizierung gebunden. Ein Produktname, dessen Witz gerade darin besteht, „KNX" anklingen zu lassen, ist markenrechtlich das Lehrbuchbeispiel für Anlehnung/Verwechslungsgefahr — Schreibweise, Groß-/Kleinschreibung oder Hochstellung ändern daran nichts (maßgeblich ist auch der Klang). Regel: **KNX nur beschreibend** („… unterstützt KNX"), nie als Namensbestandteil. Ein neutrales Suffix wie „NX" ohne Fachwerk-K-Kontext wäre unkritisch, verliert dann aber das Wortspiel.

### 2.5 Lizenzwahl für das neue Projekt

Empfehlung: **AGPL-3.0** (oder GPL-3.0).
- Schützt das Projekt davor, dass Dritte es proprietär vereinnahmen — genau das Schicksal, das die EDOMI-Community jetzt erlebt, wird strukturell verhindert.
- „Nicht-kommerziell"-Klauseln (CC-NC o. ä.) sind für Software-Communities toxisch (nicht OSI-konform, schreckt Distributionen/Integrationen ab) — nicht empfohlen.
- CLA vermeiden, DCO genügt; Urheberrecht bleibt bei den Contributors → niemand kann das Projekt später „zusperren".

---

## 3. Funktionale Analyse: Stärken erhalten, Schwächen ausmerzen

### 3.1 Stärken von EDOMI (müssen ins Zielbild)

- **Alles-in-einem:** Logikmaschine + Visualisierung + Projektierung + Archive + Backup in einem System, ohne Bastelei.
- **Live-Projektierung:** Änderungen an Logik/Visu ohne Kompilier-/Deployzyklen aktivierbar.
- **LBS-Konzept:** Logikbausteine mit Eingängen/Ausgängen, von der Community erweiterbar; grafische Verdrahtung.
- **KO-Modell:** Kommunikationsobjekte als zentrale Abstraktion zwischen KNX-GAs, Logik und Visu.
- **WYSIWYG-Visu-Editor:** pixelgenaue, frei gestaltbare Visualisierungsseiten.
- **Archive/Datenlogging** mit Diagrammen direkt integriert.
- **Deterministik & Stabilität:** läuft jahrelang unbeaufsichtigt.
- **Vollständige Backups** (ein Archiv = ganzes Projekt).

### 3.2 Schwächen (Zielbild-Verbesserungen)

| Schwäche in EDOMI 2.03 | Zielbild |
|---|---|
| CentOS 7 (EOL), monolithische Installation | Container-first (Docker/Podman/LXC), distributionsunabhängig, ARM-fähig (RasPi/Proxmox) |
| PHP 5-Ära, bcompiler | Moderner Stack, 100 % offener Code |
| Kein HTTPS/Modern-Auth out-of-the-box | TLS, Nutzer/Rollen, 2FA-fähig, API-Tokens |
| Visu technologisch gealtert, Desktop-zentriert | Responsive Web-Components/SVG-Visu, PWA, Dark-Mode, Touch |
| Nur KNX (+ HTTP-Bastellösungen via LBS) | Treiber-Architektur: KNX nativ, dazu MQTT, HTTP/REST, Modbus, 1-Wire … als Plugins |
| LBS in PHP, ungesandboxt | Sandbox-Laufzeit für Logikbausteine, definierte SDK-API, Versionierung, Registry |
| Kein Versionskontroll-Konzept für Projekte | Projektdefinition als Text (YAML/JSON) → Git-diffbar, CI-testbar |
| Zentrale MySQL-Abhängigkeit | Eingebettete DB (SQLite) als Default, Zeitreihen optimiert; optional Postgres |
| Ausführungsreihenfolge der Logik intransparent (ereignisgetrieben, aber Reihenfolge paralleler Zweige weder definiert noch sichtbar → Race-Gefühl, schwer zu debuggen) | Ereignisgetrieben **bleiben** (richtige Architektur für Gebäudeautomation), aber: dokumentierte, deterministische Ordnungsregeln (FIFO-Eventqueue, stabile topologische Reihenfolge innerhalb einer Kaskade), Zyklen-Erkennung, und **Ausführungs-Traces** à la Home Assistant (welcher Baustein lief wann, warum, mit welchen Werten) |
| Ein-Mann-Projekt, Bus-Faktor 1 | Offene Governance, Tests, CI, Doku im Repo |

### 3.3 Bewusste Nicht-Ziele (v1)

- Kein Nachbau des EDOMI-Look-and-Feel (rechtlich unnötig riskant, technisch unerwünscht).
- Keine Auslieferung fremder LBS im Projekt (Rechte liegen bei den Autoren — siehe 3.4 für die legalen Wege).
- Kein Cloud-Zwang, keine Telemetrie.

### 3.4 Übernahme von LBS und Visus: drei Wege

**Visus und Projektdaten (KOs, GAs, Seitenstruktur, Logik-Verdrahtung):** Das sind *Nutzerdaten* aus der eigenen Installation. Ein **Import-Assistent** liest sie aus der eigenen EDOMI-Datenbank/dem Backup und erzeugt daraus Fachwerk-Projektdateien (Element-Mapping-Tabelle: EDOMI-Visuelement → Fachwerk-Element; Positionen/Größen übernehmbar). Rechtlich unkritisch, solange keine mitgelieferten EDOMI-Grafiken kopiert werden — eigene hochgeladene Bilder sind okay. (Phase 6)

**LBS — drei komplementäre Wege, nach Aufwand/Wirkung gestaffelt:**

1. **Kompatibilitäts-Laufzeit (der Königsweg):** Community-LBS sind eigenständige PHP-Dateien der jeweiligen Autoren; ihr Code zeigt die vollständige API-Oberfläche (`logic_setOutput`, `logic_getInput`, EXEC-Modell …), ohne dass man EDOMI-Core-Code lesen muss. Fachwerk kann eine **sandboxed PHP-Laufzeit** mit einer reimplementierten LBS-API anbieten (eigener Container, Ressourcenlimits). Damit laufen viele bestehende LBS *unverändert* — der Nutzer importiert die LBS-Dateien, die er legitim besitzt, in seine eigene Installation. Rechtlich sauber: Die API-Reimplementierung ist Interoperabilität (§ 69a Abs. 2 UrhG), die Nutzung der LBS-Datei ist Privatgebrauch des Nutzers.
2. **Konverter/Portierungsassistent (agentengestützt):** Ein Tool bzw. Agent-Workflow, der einen vorhandenen LBS analysiert und ein natives Fachwerk-Baustein-Gerüst (neue SDK-API) erzeugt. Lokal durch den Nutzer für eigene Zwecke: unkritisch. **Veröffentlichung** des portierten Bausteins: nur mit Zustimmung des LBS-Autors.
3. **Autoren-Outreach:** Viele LBS-Autoren sind aktiv und durch die Lizenzlage frustriert (jonofe verteilt nur noch per Anfrage, philipp900 darf seine MQTT-Arbeit nicht veröffentlichen). Ein Projekt mit klarer freier Lizenz löst ihr Problem — gezielt einladen, ihre Bausteine nativ neu zu veröffentlichen. Die Baustein-Registry (Phase 4/7) ist dafür die Heimat.

> Wichtig: Fachwerk selbst liefert **keine** fremden LBS mit. Weg 1 und 2 sind Werkzeuge, die der Nutzer auf seine eigenen Dateien anwendet; Weg 3 bringt Bausteine legal in die Registry.

---

## 4. Architektur-Zielbild (Entwurf, wird in Phase 2 per ADRs entschieden)

```
┌────────────────────────────────────────────────────────┐
│  Admin-/Projektierungs-UI (Web)     Visu-Client (PWA)  │
└──────────────┬─────────────────────────┬───────────────┘
               │ REST + WebSocket        │ WebSocket
┌──────────────┴─────────────────────────┴───────────────┐
│                     Core-Server                        │
│  ┌───────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │ KO-Engine │ │ Logik-Engine │ │ Visu-Server       │  │
│  │ (Eventbus)│ │ (LBS-Sandbox)│ │ (Pages, Elemente) │  │
│  └─────┬─────┘ └──────┬───────┘ └───────────────────┘  │
│  ┌─────┴───────────── ┴───────────────────────────┐    │
│  │ Archiv/Zeitreihen · Szenen · Timer · Backup    │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ Treiber-Layer (Plugins)                        │    │
│  │  KNXnet/IP · MQTT · HTTP · Modbus · …          │    │
│  └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
   Projektdefinition = Textdateien (Git-fähig) + SQLite
```

Stack-Präferenz (zu bestätigen per ADR): **Backend Go oder TypeScript/Node**, Frontend **TypeScript + Web Components/Svelte**, KNX über eigene KNXnet/IP-Implementierung oder bewährte offene Bibliothek, Auslieferung als **ein Container-Image**.

### 4.1 Agent-first als Leitprinzip

Fachwerk wird so gebaut, dass ein Coding-Agent Logiken und Visus **ohne Friction** erstellen, testen und deployen kann — das ist ein Kern-Differenzierungsmerkmal gegenüber EDOMI (GUI-only, Zustand in MySQL-Blobs) und den meisten Alternativen:

1. **Projekt = Text.** Logiken, Visu-Seiten, KOs, Treiberkonfiguration sind deklarative Dateien (YAML/JSON) in einem Git-Repo. Der grafische Editor ist eine *Ansicht* auf dieses Format, kein zweiter Wahrheitsspeicher. Ein Agent editiert dieselben Dateien wie der Editor — diff-bar, review-bar, versionierbar.
2. **API-first.** Alles, was die Admin-UI kann, kann die REST-/WebSocket-API. Keine Funktion existiert nur als Mausklick.
3. **MCP-Server eingebaut.** Fachwerk exponiert seine Fähigkeiten als MCP-Tools: `list_datapoints`, `read_value`, `create_logic`, `validate_project`, `deploy`, `bus_monitor`, `query_archive` … Ein Agent kann damit direkt gegen die laufende Anlage arbeiten (mit Rollen/Scopes: read-only vs. deploy).
4. **Validierung & Simulation headless.** `phoenix validate` prüft ein Projekt ohne Anlage; der KNX-Simulator erlaubt Logik-Tests in CI („wenn GA 1/2/3 = EIN, dann sendet GA 1/2/4 innerhalb 100 ms EIN"). Agenten können Logiken so *beweisen* statt nur behaupten.
5. **Strukturierte Diagnose.** Logs, Busmonitor und Ereignisse als abfragbare, strukturierte Daten (JSON) — ein Agent kann Fehlerbilder selbst untersuchen.
6. **Schema + Doku maschinenlesbar.** JSON-Schemas für alle Projektdateien, SDK-Doku im Repo — Agenten (und Menschen) haben dieselbe Quelle.

Konsequenz für die Phasen: Das Projektdateiformat inkl. Schemas entsteht **früh** (Phase 2/3, nicht nachträglich); der MCP-Server kommt als dünne Schicht über der API bereits im MVP (Phase 3), Ausbau in Phase 4/5.

### 4.2 Sicherheitsarchitektur, Agenten-Guardrails & Betriebsgüte („Industrial Grade")

Ehrliche Einordnung vorweg: Formale Zertifizierung (IEC 62443, ISO 27001) ist für ein Community-Projekt unrealistisch — aber die **Engineering-Praktiken** dahinter sind erreichbar und werden von Tag 1 mitgebaut, nicht nachgerüstet.

**Schutz gegen Angreifer von außen (Script-Kiddies & besser):**
- Standard-Betriebsmodell: **kein Port-Forwarding, niemals**. Fernzugriff ausschließlich via VPN (WireGuard/Tailscale); die Doku macht das zum beschriebenen Standardweg, nicht zur Fußnote.
- TLS überall (auch intern), moderne Auth: Argon2-Hashing, 2FA/Passkeys, Session-Härtung, Lockout nach Fehlversuchen.
- API-Tokens grundsätzlich **scoped** (read / write / deploy / admin getrennt), rotierbar, widerrufbar.
- Netzsegmentierung als dokumentierte Referenzarchitektur: KNX-IP-Router nie im selben Netz wie IoT-/Gast-WLAN; Unterstützung für **KNX IP Secure / Data Secure**, wo die Hardware es hergibt.
- Supply-Chain: signierte Releases, SBOM, Dependency-Scanning in CI, reproduzierbare Builds (soweit Stack es erlaubt), Responsible-Disclosure-Policy (`SECURITY.md`).

**Agenten-Guardrails (gegen „rogue agents" — und gegen versehentliche Agenten-Fehler, der häufigere Fall):**
1. **Scopes statt Vertrauen:** MCP-/API-Tokens für Agenten sind default **read + validate**. `deploy` und Buszugriff sind separate Scopes.
2. **Human-in-the-loop-Deploy:** Ein Agent kann ein Projekt ändern und validieren — die *Aktivierung* auf der Anlage erfordert menschliche Freigabe (Review des Diffs, wie ein PR-Merge). Optional abschaltbar für Unkritisches, aber Default ist Freigabepflicht.
3. **Geschützte Datenpunkt-Klassen:** Schlösser, Alarmanlage, Tore, Zutritt werden als `protected` klassifiziert. Agenten-Tokens können diese Klasse **nie** schreiben — auch nicht mit deploy-Scope; Freigabe nur über Admin-Rolle mit 2FA. Die Klassifizierung liegt in der Projektdatei und ist damit selbst review-pflichtig.
4. **Simulation vor Aktivierung:** Logikänderungen laufen erst gegen den Simulator (ggf. mit historischen Busdaten); der Trace ist Teil des Freigabe-Diffs.
5. **Vollständiges Audit-Log:** Jede Zustandsänderung mit Identität (Mensch/Agent/Token), Zeitpunkt, Quelle — abfragbar und manipulationsgeschützt (append-only).
6. **Rate-Limits & Anomalie-Alarme:** ungewöhnliche Schreibraten auf den Bus (Telegramm-Sturm) werden gedrosselt und gemeldet.

**Physische Sicherheit — das eigentliche Sicherheitsnetz:**
- KNX-Grundprinzip nutzen: Wandtaster und Aktoren kommunizieren **direkt über den Bus**. Designregel: Fachwerk ergänzt die Grundbedienung, ersetzt sie nie — fällt der Server aus, funktionieren Licht, Jalousie, Heizung weiter. Die Doku fordert diese Grundprojektierung aktiv ein.
- **Niemand wird ein- oder ausgesperrt:** Türschlösser gehören nicht in alleinige Software-Kontrolle. Referenzarchitektur: mechanischer Notzugang immer vorhanden, Fluchtrichtung immer mechanisch begehbar (Panikfunktion), Software darf höchstens *zusätzlich* verriegeln, nie den Notweg blockieren. Fail-safe/fail-secure wird pro Gerät bewusst entschieden und dokumentiert.

**Betriebsgüte:**
- Supervised Processes + Watchdog, Crash-only-Design (Neustart ist immer sicher, Zustand persistent), Health-Endpoints, Metriken (Prometheus-Format).
- Soak-Tests (Wochen, nicht Stunden) und Fuzzing der Bus-/API-Parser in CI; Lasttest mit Telegramm-Stürmen.
- Updates rollback-fähig (A/B bzw. Snapshot vor Update), Projektdateiformate mit Versionierung + Migrationspfad, LTS-Zweige.

Diese Anforderungen fließen als Akzeptanzkriterien in die Phasen ein: Threat Model & Scopes-Design in Phase 2, Auth/TLS/Audit-Log im MVP (Phase 3), Guardrails + Simulation in Phase 4, Pen-Test & Soak in Phase 6.

---

## 5. Phasenplan für co-agentische Entwicklung

Grundprinzip der Zusammenarbeit Mensch + Agent: **Spezifikation ist die Quelle der Wahrheit.** Du (Domänenexperte, Betreiber der Referenzanlage) lieferst Verhalten, Prioritäten und Abnahme; ich (Agenten) liefere Recherche, Spezifikationstexte, Architektur, Implementierung, Tests und Doku — jeweils als PR gegen das Repo, von dir reviewt.

### Phase 0 — Gründung (1–2 Wochen)

**Ziel:** Rechtssicheres, agententaugliches Fundament.
- [x] Projektname festlegen → Arbeitsname **Fachwerk** (ADR-0001; formaler Markencheck folgt in Phase 7)
- [x] Git-Repo angelegt (`VSC/fachwerk`); AGPL-3.0 (`LICENSE`, `NOTICE`, ADR-0002)
- [x] `CONTRIBUTING.md` mit **Clean-Room-Policy** und DCO-Pflicht
- [x] `CLAUDE.md` (Arbeitsregeln für Agenten: Clean-Room-Regeln, Code-Konventionen, Definition of Done)
- [x] Repo-Struktur: `specs/`, `adr/`, `core/`, `drivers/`, `ui/`, `docs/`, `tools/`
- [x] CI-Grundgerüst: Hygiene-Gate (`tools/check-repo.sh` + GitHub-Actions-Workflow); Build-/Test-/Container-Jobs folgen mit dem Code ab Phase 3
- **Abnahme:** Repo existiert, Policies stehen, Hygiene-Check lokal grün ✓ (Actions-Lauf folgt mit dem ersten Push zu GitHub — offene Entscheidung: öffentlich ab Tag 1 oder ab MVP?)

### Phase 1 — Funktionale Analyse & Spezifikation (3–6 Wochen, parallelisierbar)

**Ziel:** EDOMI-Verhalten als Black-Box-Spezifikation; Anforderungskatalog.
- [ ] Feature-Inventar aus Nutzersicht (deine DEV-LXC als Referenz: bedienen, beobachten, dokumentieren — kein Codeblick)
- [x] Recherche im KNX-User-Forum: Community-Anforderungskatalog liegt vor → **ANFORDERUNGEN-COMMUNITY.md** (5 Kern-USPs als nicht verhandelbarer Kern; Rohmaterial für MoSCoW)
- [ ] Spezifikationen in `specs/` je Subsystem: KO-Modell, Logik-Ausführungsmodell (Trigger-/Wert-Semantik!), Visu-Elemente, Archive, Szenen/Timer, Backup, KNX-Anbindung
- [ ] Priorisierung: MoSCoW (Must/Should/Could/Won't) für v1
- [ ] Export deiner eigenen Projektdaten aus der LXC als Migrations-Testkorpus
- **Co-agentisch:** Agenten-Fan-out über Forum-/Doku-Recherche und Spec-Entwürfe; du korrigierst Verhaltensdetails, die nur ein Betreiber kennt.
- **Abnahme:** Specs reviewt; „So verhält sich das Zielsystem" ist ohne EDOMI-Code beantwortbar.

### Phase 2 — Architektur & Technologieentscheidungen (2–3 Wochen)

**Ziel:** Tragfähige, dokumentierte Architektur.
- [ ] ADRs (Architecture Decision Records) für: Sprache/Runtime, KNX-Stack, Datenhaltung, LBS-Sandbox-Modell, Frontend-Stack, Projektdateiformat, Deployment
- [ ] Bedrohungsmodell / Security-Konzept (Auth, TLS, Netztrennung KNX)
- [ ] Performance-Budget (Zielhardware: RasPi 4 / kleiner LXC)
- [ ] Prototypen-Spikes für Risikothemen (KNXnet/IP-Tunneling, Sandbox, WebSocket-Visu-Latenz)
- **Co-agentisch:** Pro Entscheidung 2–3 unabhängige Agenten-Analysen, du entscheidest per ADR.
- **Abnahme:** Alle ADRs beschlossen; Spikes belegen Machbarkeit.

### Phase 3 — Walking Skeleton / MVP (6–10 Wochen)

**Ziel:** Dünner, aber durchgehender Pfad: Bus → Logik → Visu.
- [ ] KNX-Treiber: Verbindung zu IP-Gateway, GA lesen/schreiben, DPT-Kodierung (Kern-DPTs)
- [ ] KO-Engine: KOs anlegen, GA-Zuordnung, Eventbus, Persistenz
- [ ] Mini-Logik: 3–5 eingebaute Bausteine (Und/Oder, Vergleich, Treppenlicht, Sende-Gate)
- [ ] Mini-Visu: eine Seite, Taster + Statusanzeige + Wert, live über WebSocket
- [ ] Admin-UI: KO-Liste, Logik-Verdrahtung (rudimentär), Aktivieren ohne Neustart
- [ ] Deployment: ein Container, läuft in deiner Umgebung **parallel** zu EDOMI (Read-only-Anfang: erst mitlesen, dann schalten)
- **Abnahme:** Ein realer Lichtkreis bei dir ist über das neue System bedien- und visualisierbar.

### Phase 4 — Logik-Engine & LBS-SDK (6–8 Wochen)

**Ziel:** Das Herzstück in voller Tiefe.
- [ ] Vollständiges Ausführungsmodell laut Spec (Trigger-Semantik, Reihenfolgen, Zeitverhalten, Persistenz von Zuständen)
- [ ] Sandbox für nutzerdefinierte Bausteine (Ressourcen-/Zeitlimits, definierte API)
- [ ] LBS-SDK + Doku + Beispielbausteine; lokales Testen von Bausteinen
- [ ] Kuratierte Standard-Fachbausteine (Beschattung, sperrbare Lichter, Heizmodi mit Zwangsführung, Multi-State-Schalter) — laut Community-Katalog ★★★-Anforderung, war EDOMIs heimlicher USP gegenüber HA-Blueprints
- [ ] Grafischer Logik-Editor (Verdrahtung, Live-Werte, Debug-Ansicht)
- [ ] Ausführungs-Traces: pro Ereignis-Kaskade nachvollziehbar, welcher Baustein wann, warum und mit welchen Werten lief (Vorbild HA-Automation-Traces); deterministische Ordnungsregeln laut Spec
- [ ] Baustein-Paketformat (versioniert, signierbar) als Basis einer späteren Community-Registry
- [ ] LBS-Kompatibilitäts-Laufzeit (sandboxed PHP mit reimplementierter LBS-API, siehe 3.4) — Machbarkeits-Spike hier, Vollausbau nach Bedarf in Phase 6
- **Abnahme:** Deine wichtigsten EDOMI-Logiken sind nachgebaut und laufen dauerhaft stabil.

### Phase 5 — Visualisierung & Editor (6–8 Wochen, überlappt Phase 4)

**Ziel:** Der WYSIWYG-Editor, der EDOMI ausgezeichnet hat — modern.
- [ ] Element-Bibliothek (Taster, Dimmer, Jalousie, Werte, Diagramme, Kamera, iFrame …)
- [ ] Editor: Drag&Drop, Raster, Ebenen, Vorlagen/Instanzen, Responsive-Varianten
- [ ] PWA-Client: Touch, Offline-Hinweis, mehrere Panels/Profile
- [ ] Archive & Diagramme (Zeitreihen, Aggregation, Export)
- **Abnahme:** Deine Haupt-Visu-Seiten sind im neuen System nachgebaut und alltagstauglich.

### Phase 6 — Migration & Härtung (4–6 Wochen)

**Ziel:** Umstieg realer EDOMI-Anlagen erleichtern; Produktionsreife.
- [ ] Import-Assistent für *eigene* EDOMI-Projektdaten (GA-/KO-Listen, Struktur) — als Modellierungshilfe, nicht 1:1-Kopie
- [ ] ETS-Import (Gruppenadressen aus ETS-Export)
- [ ] Backup/Restore als Ein-Datei-Archiv; automatische Backups
- [ ] Security-Review, Lasttests, Langzeit-Soak-Test auf deiner Anlage
- [ ] Doku: Installation, Umstiegs-Guide „von EDOMI", LBS-Porting-Guide
- **Abnahme:** Deine Anlage läuft produktiv auf dem neuen System; EDOMI nur noch als Fallback.

### Phase 7 — Veröffentlichung & Community (fortlaufend)

- [ ] Rechts-Check vor Veröffentlichung (Name, Clean-Room-Dokumentation, Assets)
- [ ] **Provenance-Audit als Release-Gate:** Werkzeuggestützter Ähnlichkeitsvergleich (Fingerprinting/Winnowing à la JPlag/PMD-CPD) der Fachwerk-Codebase gegen eine *lokal* vorhandene, legal lizenzierte EDOMI-Installation — durchgeführt von einem berechtigten Nutzer, veröffentlicht wird nur der Report (nie EDOMI-Code). Zweck: dokumentierter Nachweis der Clean-Room-Disziplin, Vertrauensanker für die Community. Treffer auf triviale Allerwelts-Idiome werden gegen einen Referenzkorpus gefiltert.
- [ ] `SECURITY.md` + Responsible-Disclosure-Prozess aktiv
- [ ] v1.0-Release: GitHub-Org, Container-Registry, Doku-Site
- [ ] Community-Aufbau: Forum-Thread/Discussions, Baustein-Registry, Governance-Dokument (Maintainer-Modell — bewusst kein Bus-Faktor 1)
- [ ] Release-Zyklus, LTS-Politik, Security-Prozess

### Grobe Gesamtdauer

Mit konsequenter co-agentischer Arbeit (Agenten implementieren, du steuerst und nimmst ab, mehrere Stunden pro Woche Review): **realistisch 6–9 Monate bis zur produktiven Nutzung auf deiner Anlage** (Ende Phase 6), v1.0-Veröffentlichung danach.

---

## 6. Co-agentischer Arbeitsmodus (wie wir konkret arbeiten)

1. **Alles ist eine Datei im Repo:** Specs, ADRs, Aufgaben (Issues), Code, Tests, Doku. Agenten arbeiten nur gegen Repo-Inhalte — kein Wissen „im Chat" verlieren.
2. **Issue → Branch → PR → Review:** Jede Aufgabe wird als Issue mit Verweis auf die Spec formuliert; Agenten liefern PRs inkl. Tests; du reviewst und merged.
3. **Tests als Abnahmekriterium:** Jede Spec bekommt ausführbare Akzeptanztests (inkl. KNX-Simulator für busloses Testen in CI).
4. **ADR-Disziplin:** Keine Grundsatzentscheidung ohne ADR — verhindert, dass Agenten-Sessions Entscheidungen unbemerkt umwerfen.
5. **`CLAUDE.md` als Agenten-Vertrag:** Clean-Room-Regeln, Konventionen, „niemals EDOMI-Code lesen/übernehmen" maschinenlesbar verankert.
6. **Referenzanlage als Orakel:** Deine DEV-LXC/Anlage beantwortet Verhaltensfragen (Black-Box); strittige Semantik wird dort verifiziert und in die Spec zurückgeschrieben.

---

## 7. Offene Entscheidungen (nächste Schritte)

1. ~~**Projektname**~~ — entschieden: Arbeitsname „Fachwerk" (formaler Markencheck vor Veröffentlichung, Phase 7).
2. **Lizenz bestätigen** (Empfehlung AGPL-3.0). Achtung Wechselwirkung mit einem etwaigen späteren **Bezahlmodell**: AGPL erlaubt Kommerz rund ums Projekt (Support, Hosting, vorkonfigurierte Hardware, „zertifizierte" Angebote über die Projektmarke) — aber Dual-Licensing/Open-Core bräuchte gebündelte Urheberrechte (CLA), was wir aus Community-Schutzgründen ausgeschlossen haben. Diese Tür schließt sich mit dem ersten externen Beitrag; die Grundsatzentscheidung fällt daher faktisch in Phase 0.
3. **Stack-Vorentscheidung** Go vs. TypeScript (Phase 2, aber frühe Tendenz hilft).
4. **Scope v1:** Nur KNX, oder MQTT von Anfang an dabei?
5. **Öffentlich ab Tag 1** (GitHub public) oder erst ab MVP?
