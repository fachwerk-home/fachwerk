# LBS-Nachfragekatalog (Forum-Scan, Stand 12.07.2026)

> Zweck: Priorisierungsgrundlage für das „Volle Regale"-Programm (BACKLOG B-6, ADR-0008
> S-7). **Nur Metadaten** — es wurde kein LBS-Code heruntergeladen oder eingesehen
> (Clean-Room, CONTRIBUTING). Rohdaten: [daten/lbs-katalog.csv](daten/lbs-katalog.csv)
> (848 LBS, 124 Autoren; Spalten: id, name, kategorie, autor, version, aktualisiert,
> eingestellt).
>
> Datenbasis: offizielle LBS-Downloadliste (service.knx-user-forum.de, vollständig
> geparst), 13 Threadlisten-Seiten des EDOMI-Unterforums (Antworten/Aufrufe als
> Popularitätsmaß), Nachfrage-Threads (Quo vadis, Umstiegs-/Alternativen-/
> Lieblingsfunktionen-Threads).

## Kernbefund

Die Downloadliste lebt (114 Updates 2025/26), aber **die vier aktivsten LBS-Linien des
Forums fehlen darin komplett**: die jonofe-Suite (Telegram, MQTT, Alexa Control, Hue —
zusammen >3.300 Antworten, >180.000 Aufrufe). Autor unerreichbar, restriktive Lizenz
verhindert Community-Pflege; im Quo-vadis-Thread explizit beklagt. **Die größte Nachfrage
ist zugleich eine Versorgungslücke — und für Fachwerk ohne jeden EDOMI-Bezug füllbar**
(Telegram-Bot-API, MQTT nativ im Core, Hue-/Alexa-Treiber gegen die Hersteller-APIs).

## A. Top-30 nach Nachfrage-Evidenz

Gewichtung: explizit vermisst/Ersatz im Bau > Thread-Aktivität (Antworten/Aufrufe) >
Existenz. „FEHLT" = nicht mehr in der Downloadliste.

| # | LBS / Funktion | Autor | Kategorie | Evidenz |
|---|---|---|---|---|
| 1 | Telegram Suite (Contact/Receiver/Command) | jonofe | Fremdsystem | 1.059/62.457; **FEHLT**, explizit vermisst |
| 2 | MQTT API Server + Clients | jonofe | Fremdsystem | 897/49.905; **FEHLT**; sipiyou baut 2026 Ersatz |
| 3 | Beschattungssteuerung-NG 19000145 | starwarsfan | Fachlogik | **1.417/65.021 — aktivster LBS-Thread** |
| 4 | Alexa Control | jonofe | Fremdsystem | 777/32.337; **FEHLT**; zwei Ersatzlinien aktiv |
| 5 | Sonos Controller 19000027 | timberland | Fremdsystem | 748/69.333 (höchste Aufrufzahl) |
| 6 | HUE Bridge/Light/Plug | jonofe | Fremdsystem | 665/37.155; **FEHLT**; HUE-V2-Neubau läuft |
| 7 | ics/CalDAV Kalender (Müllkalender!) | Community | Fremdsystem | 459/30.549; Dauerthema |
| 8 | Squeezebox-Sammlung | wintermute | Fremdsystem | 769/39.816 |
| 9 | Diagramme (Visu) | basaltnischl | Visu-nah | 455/44.045 |
| 10 | Wetter (WU/DarkSky/DWD/OpenWeather) | diverse | Fremdsystem | 51 Wetter-LBS; hoher API-Verschleiß |
| 11 | Xiaomi/Roborock | sipiyou | Fremdsystem | 543/25.217 |
| 12 | Beschattung (Rollo) 19000707 | starwarsfan | Fachlogik | 307/21.500 |
| 13 | Statistik Verbrauchsdaten | twi127 | Zähler | 298/23.255 |
| 14 | vcontrold/Viessmann | tger977 | Fremdsystem | 282/21.999 |
| 15 | Modbus-Familie (Read/Write/Generic) | diverse | Fremdsystem | sipiyou-Neubau 2026 → ungedeckter Bedarf |
| 16 | 1-Wire (owphp) | jonofe | Fremdsystem | 215/14.402; **FEHLT** |
| 17 | NibeUplink Wärmepumpe | DerSeppel | Fremdsystem | 204/11.392 |
| 18 | InfluxDB/Grafana-Anbindung | gulp2k u. a. | Fremdsystem | 178/16.567 |
| 19 | Helios easycontrol (KWL) | DaLinux | Fremdsystem | 197/9.933 |
| 20 | Home Connect Suite | vento66→eXec | Fremdsystem | **FEHLT**, Neuauflage 06/2026 → Bedarf belegt |
| 21 | Fritzbox-Suite (Callmonitor …) | Winni, saegefisch | Fremdsystem | mehrfach „Lieblingsfunktion" |
| 22 | Husqvarna Automower | dpoth | Fremdsystem | 177/8.381 |
| 23 | Neato Botvac | hartwigm | Fremdsystem | 277/10.367 |
| 24 | LG TV webOS | mars | Fremdsystem | 168/6.738; **FEHLT** |
| 25 | PV/Energie-Cluster (Fronius, Tibber, easee, evcc, Solcast, Strompreise) | diverse | Fremdsystem | jüngster Wachstumsbereich |
| 26 | Stiebel Eltron ISG | motn | Fremdsystem | 130/6.549 |
| 27 | Homematic Event Receiver | Nanosonde | Fremdsystem | 117/6.970; 17 Homematic-LBS |
| 28 | UniFi Anwesenheitserkennung | wintermute | Fachlogik | 106/7.145 |
| 29 | Warn-/Alarmierung (NINA, DWD, Pushover) | diverse | Fachlogik | 108/5.588 u. a. |
| 30 | PID-Regler (generisch) | saegefisch | Werkzeug | 69/3.547; kein HA-Pendant |

Knapp dahinter: Denon HEOS, Landis+Gyr E350, Gartenbewässerung, Miele@home, Spotify
(FEHLT), Netatmo, Nuki, Grünbeck, AWTRIX, TelegramSend-Ersatz (2025).

## B. Kategorien-Statistik (848 Katalog-Einträge)

| Kategorie | Anteil | Fachwerk-Zuordnung |
|---|---|---|
| **Fremdsystem-Anbindung** | ~46 % (391) | → Treiber (ADR-0007 Stufe 2) bzw. Service-Bausteine; MQTT-Core deckt einen erheblichen Teil generisch ab |
| **Werkzeug/Hilfsbausteine** | ~34 % (290) | → Commodity: gehört fast vollständig in die **Standardbibliothek** (Gatter, Mathe, Text, Wandler, Filter …) |
| **Fachlogik** | ~20 % (167) | → kuratierte Fach-Bausteine (Beschattung, Heizung, Astro, Alarmierung, Lastmanagement) |
| Visu-nah | (quer) | → Visu-Elemente (Diagramme = SPEC-004-Anbindung) |

Nach *Thread-Aktivität* dominiert Fremdsystem (7 der Top 10); Werkzeug-LBS sind zahlreich,
aber diskussionsarm (Commodity — genau richtig für die Stdlib).

## C. Beobachtungen / Konsequenzen für Fachwerk

1. **Die Top-Nachfrage ist eine Lücke:** Telegram, MQTT, Alexa, Hue (jonofe-Suite) sind
   verschwunden. Fachwerk kann exakt diese Lücke nativ füllen (MQTT = Core per ADR-0007;
   Telegram/Hue = Stufe-2-Treiber gegen Hersteller-APIs; null EDOMI-Bezug, null
   Rechtefrage).
2. **Beschattung ist die Königs-Fachlogik** (aktivster Thread überhaupt) → Priorität für
   die kuratierten Fach-Bausteine (Plan Phase 4); starwarsfan ist der natürliche
   Ansprechpartner.
3. **Wetter braucht eine Abstraktion:** 51 LBS, weil jede API-Abschaltung neue Bausteine
   erzwang → Fachwerk baut EINEN Wetter-Datenpunkt-Provider mit austauschbaren Quellen.
4. **PV/Energie ist der Wachstumsmarkt** (Tibber, evcc, Wallboxen, Strompreise) → bei
   Treiber-Priorisierung berücksichtigen.
5. **Distribution ist selbst ein Schmerzpunkt** (Uploadseite offline, Module verschwinden)
   → unsere Registry (ADR-0008 S-6) adressiert ein akutes, dokumentiertes Problem.
6. **Outreach-Kandidaten** (produktiv/aktiv): **sipiyou** (aktivster Neuentwickler
   2025/26: MQTT, Modbus, Hue V2, Govee …), **eXec** (aktiv 2026), **starwarsfan**
   (Beschattung + Infrastruktur), wintermute (58 LBS), Winni (111), saegefisch, twi127,
   Nanosonde. **Sonderfall jonofe:** unerreichbar, restriktive Lizenz — seine Domänen
   sind die klarsten Clean-Reimplementierungs-Kandidaten.

## D. Limitationen

Aufruf-/Antwortzahlen nur für Threads der ersten ~13 Listen-Seiten (nach Aktivität
sortiert; ältere abgeschlossene Threads unterrepräsentiert, per Suchabfragen teilweise
kompensiert). Migrations-Threads nennen eher Funktionsklassen als LBS-Nummern. Zahlen:
Stand Juli 2026.

## E. Quellen

- LBS-Downloadliste: https://service.knx-user-forum.de/?comm=downloadliste&key=2
- EDOMI-Unterforum Threadlisten S. 1–13: https://knx-user-forum.de/forum/projektforen/edomi
- Quo vadis Edomi: …/1956975 (bes. S. 10/18/21) · Umstieg zu HA: …/2070815 ·
  Alternativen: …/1999229 · Lieblingsfunktionen: …/1035701 · Module offline: …/2021392 ·
  LBS-Updates/Changelogs: …/936676
- Einzel-LBS-Thread-URLs: siehe Verweise in Abschnitt A der Scan-Rohfassung (Agent-Report,
  12.07.2026) bzw. Threadlisten.
