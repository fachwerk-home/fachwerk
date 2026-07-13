# Anforderungskatalog aus der Community (Forum-Auswertung, Stand 07/2026)

> Quellen: „Quo vadis Edomi" (QV, 22 Seiten), „Schwieriger Umstieg von Edomi zu Home Assistant" (UM, 7 Seiten), „EDOMI-LTS – future development" (LTS) — alle knx-user-forum.de.
> Gewichtung: ★★★ häufig + nachdrücklich · ★★ mehrfach · ★ einzeln.
> Dieses Dokument ist Rohmaterial für die MoSCoW-Priorisierung in Phase 1 (siehe ANALYSE-UND-PLAN.md).

## Konsens-Destillat: Die fünf Kern-USPs eines Nachfolgers

1. **Grafischer LBS-basierter Logik-Editor mit Live-Zuständen** — meistgenannte Anforderung, quer durch alle Threads.
2. **Pixelgenauer No-Code-Visu-Editor mit Templates** — plus Responsivität als notwendige Verbesserung.
3. **KNX als First-Class-Citizen** — inkl. Sperr-/Zwangsführungslogiken und Multi-State-Schaltern.
4. **Alles „aus einem Guss"** — Logik + Visu + Archiv integriert, in 5 Minuten produktiv.
5. **Offene Lizenz + moderner Unterbau** — Container, aktueller Stack, natives MQTT.

## 1. Logik-Engine (höchstes Gesamtgewicht)

| Gew. | Anforderung | Belege |
|---|---|---|
| ★★★ | Grafischer Logik-Editor mit LBS-Blackbox-Prinzip (Eingänge rein, Ergebnis raus) | ThorstenGehrig: „Die Logik-Engine gefällt mir bei EDOMI 100-mal besser" (QV S. 11); „Das fehlt mir am Home Assistant am meisten" (QV S. 20 #297); Brick: „du gibst nur deine Werte vorn rein und hinten kommt das Ergebnis raus" (QV S. 11), vermisst grafische Logik auch bei IP-Symcon (QV S. 20 #300); tsb2001 (UM S. 2); givemeone: „Logiken sind in HA so viel unübersichtlicher" (UM S. 1) |
| ★★★ | Automatisierungen jenseits von „Wenn–Dann" (HA-Paradigma zu simpel) | mfd (UM S. 1); rdeckard (UM S. 7); jcd: Logik-Engine IST der USP (QV S. 7 #91) |
| ★★★ | Fertige, hochwertige Fachlogiken (Beschattung, Licht, Heizung) | tobo: EDOMI-Beschattung „deutlich besser und nachvollziehbarer als HA-Blueprints" (QV S. 11); givemeone: sperrbare Lichter, forcierte Heizmodi, 3-/4-Status-Schalter on/off/locked-on/locked-off (QV S. 7); vermisster Beschattungs-LBS von starwarsfan (QV S. 11) |
| ★★ | Live-Debugging / Live-Werte direkt im Logik-Editor | Brick (QV S. 11); Node-RED-Live-Werte als Vorbild (gibsonrocker, QV S. 11) |
| ★ | Logik-Simulation auf Basis historischer Bus-Werte (über EDOMI hinaus) | jayem0 (QV S. 17 #243) |

## 2. Visualisierung

| Gew. | Anforderung | Belege |
|---|---|---|
| ★★★ | Pixelgenauer Drag-&-Drop-Editor ohne Code, „5-Minuten-Dashboards" | tsb2001: pixelgenau, dynamische Farbpalette; in HA muss man das coden (UM S. 2–3); schranzflash: „In HA brauch ich ewig lange Templates … hab Wochen verbracht … merke jetzt erst, wie intuitiv Edomi war" (UM S. 1); mfd: HA hat keine „gescheite Visu" (UM S. 1); starwarsfan: Drag-&-Drop-Editor wäre „Gamechanger" (UM S. 4) |
| ★★ | Objekt-Templates mit globaler Änderung / Wiederverwendung | oefchen (UM S. 3); scw2wi (UM S. 3) |
| ★★ | Responsive Design (EDOMI-Schwäche, muss behoben werden) | tobo: „keine Energie mehr, die Visu auf alle Endgeräte anzupassen" (QV S. 11); henfri/tsb2001 (UM S. 3); rdeckard: pixelgenau UND HTML5-flexibel (UM S. 7) |

## 3. Geräte-/Systemanbindung

| Gew. | Anforderung | Belege |
|---|---|---|
| ★★★ | Erstklassige native KNX-Integration „aus einem Guss" | meisterschaf (QV S. 7); scw2wi: „HA stark bei Integrationen, Edomi bei KNX/Logik/Dashboard — gemeinsam unschlagbar"; KNX-Entitäten automatisch erben (UM S. 1–2) |
| ★★★ | Breite Geräteintegration wie HA (EDOMI-Schwäche) | skyacer (QV S. 11); payback007: „Anbindung anderer Systeme an Edomi eher schwierig", Hybrid via MQTT (QV S. 7); KNX2013 (QV S. 18) |
| ★★ | Natives MQTT als Kernfeature, nicht als LBS-Nachrüstung | DerSeppel (QV S. 17 #242); philipp900: nativ implementiert, darf es nicht veröffentlichen (UM S. 5–6); Rajesh/LTS: MQTT als Brücke zu Zigbee/Z-Wave/Matter; sipiyou: „Liste, welche Anbindungen noch fehlen" (QV S. 21) |

## 4. Betrieb / Plattform

| Gew. | Anforderung | Belege |
|---|---|---|
| ★★★ | Moderner, gepflegter Unterbau (CentOS-EOL/PHP-7-Falle nie wieder) | WWebber (QV S. 7); starwarsfan: Rocky + PHP 8 „the way to go", scheitert an Lizenz (QV S. 9); tobiasr (QV S. 9); Gecko (QV S. 17 #241) → containerfähig, aktuelle Versionen, kein Distributions-Lock-in |
| ★★★ | Offene Lizenz — die Kernlehre des EDOMI-Endes | Ing-Dom (QV S. 3); wintermute (QV S. 4); jonofe: „completely unclear legal situation" (LTS); scw2wi: MIT/Apache/GPL (UM); uzi10: keine Abo-Modelle (QV S. 20 #292) |
| ★★ | Stabilität: jahrelanger wartungsfreier Betrieb (EDOMI-Messlatte) | philipp900: „läuft noch die nächsten 100 Jahre stabil" (UM S. 1); ThorstenGehrig: „ohne Weiterentwicklung noch 10 Jahre nutzbar" (QV S. 11); sipiyou (QV S. 21) |
| ★ | Lokal, kein Cloud-Zwang, keine Bevormundung | mfd: Ablehnung erzwungener Cloud/Discovery (UM S. 1) |

## 5. Migration / Kompatibilität

- ★★ **Kompatibilitätsfrage explizit offen:** vollständig EDOMI-kompatibel oder nur „vergleichbare Möglichkeiten"? (scw2wi, UM S. 3 — im Forum unbeantwortet; Fachwerk-Antwort: Konzept-Kompatibilität + Importwege, siehe ANALYSE-UND-PLAN.md § 3.4)
- Kein Nutzer fordert einen automatischen EDOMI-Konverter — der Schmerzpunkt ist der **Wochen-Aufwand manueller Migration** (schranzflash, UM S. 1) → ETS-/GA-Importer hat hohen Hebel (vgl. Bedarf, den knx2ha.com bediente)
- Alternative Architekturideen aus dem Forum: EDOMI-USPs als HA-Add-on (jcd QV S. 7; minnten UM S. 2; starwarsfan: „OpenEdomi-Visu"/„OpenEdomi-Logik" modular auf HA/Node-RED, UM S. 3)

## 6. Sonstiges

- ★ Modernes Datenbank-Backend (DerSeppel, QV S. 17 #242)
- ★ Standardisierte Zeitreihen-Anbindung statt proprietärer Archive — Nutzer ersetzen EDOMI-Archive durch InfluxDB+Grafana (bluegaspode, Hantago, QV S. 12)
- ★ Mehrsprachigkeit/Englisch — EDOMI war rein deutsch (Rajesh, LTS)
- ★ Baustein-Verteilung darf nicht an einer Person/Plattform hängen (LBS-Rückzüge: jonofe QV S. 16, eXec/mycroft2k QV S. 18) → dezentrale/redundante Registry

## Randbedingung / Projektrisiko

> rdeckard: „JEDER hier hat eine andere Vorstellung, wie ein Edomi-Nachfolger sein müsste." (UM S. 7)

Scope-Konsens ist das größte Risiko — deshalb (siehe Plan § 1.1): kleines Kernteam entscheidet per ADR, MVP vor Community-Aufruf, die fünf Kern-USPs sind der nicht verhandelbare Kern, alles andere ist Could-have.
