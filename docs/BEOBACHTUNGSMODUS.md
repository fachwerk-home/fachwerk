# Beobachtungsmodus — Fachwerk am echten Bus, risikofrei

Der Beobachtungsmodus lässt Fachwerk die **echten** KNX-Telegramme empfangen und die
importierte Logik darauf rechnen — aber **niemals senden**. So sieht man live, was die
Anlage tut und was Fachwerks Logik täte, ohne jedes Risiko für die laufende Installation.

## Was er tut

- **Empfängt** alle Gruppentelegramme über den KNXnet/IP-Tunnel (passiv).
- **Rechnet** die Logik-Kaskaden auf echten Werten (Traces wie immer).
- **Sendet NIE.** `sende()` überträgt nichts, sondern meldet nur als Dry-Run, *was* gesendet
  würde. Doppelt abgesichert: Treiber-Flag + Nichtübertragung im Sendepfad.

Ausgabe (stderr):
```
== BEOBACHTUNGSMODUS == empfange Bustelegramme, sende NIE.
RX  6/1/83 = true  → eg.kueche_spots        # vom Bus empfangen
[BEOBACHTUNG] würde senden  6/1/200 = true   # was die Logik täte (nicht gesendet)
```
Die vollständigen Ausführungs-Traces (JSONL) laufen wie gewohnt nach stdout.

## Schritt 0 — Interface finden

Reicht die IP? **Ja** (Port default 3671). Gateway-IP finden:
```bash
python tools/knx-discover.py      # listet KNXnet/IP-Interfaces/-Router im Netz
```
Alternativ: aus FHEM (`list <knx-io-device>` → `DEF`-Zeile, falls FHEM am KNX hängt),
aus der Router-Weboberfläche oder dem ETS-Projekt.
Vorbehalte: ein **freier Tunnel-Slot** nötig (Interfaces haben oft nur 1–4; ein Router mehr);
**KNX Secure** wird noch nicht unterstützt.

## Am echten Bus starten (lokal)

```bash
FACHWERK_KNX_HOST=<ip-des-knx-interface> \
FACHWERK_KNX_PORT=3671 \
FACHWERK_KNX_MODUS=beobachten \
  node cli/src/main.ts run <gewerk-verzeichnis>
```
`FACHWERK_KNX_MODUS` leer/ungesetzt = normaler Betrieb (sendet). Nur der exakte Wert
`beobachten` aktiviert den Nur-Lese-Modus.

## Auf dem Portainer-Host deployen

`docker-compose.beobachten.yml` fährt **nur** Fachwerk (kein Simulator), im
Beobachtungsmodus, mit Host-Netz. Standard-Gewerk ist `examples/abnahme-licht-status`
(deine echten Licht-Status-GAs → Sammelmeldung).

Es gibt **kein Image zum Hochladen**: `.github/workflows/image.yml` veröffentlicht
bei jedem Push nach `ghcr.io/fachwerk-home/fachwerk:latest` (öffentlich ziehbar,
kein Login). `docker-compose.beobachten.yml` **zieht** dieses Image — es baut
bewusst **nicht** (siehe Fallstricke). Läuft **ohne Volume**: die Beispiel-Gewerke
sind im Image (Projekt-Artefakte); nur *eigene* Gewerke kommen per Volume.

**Portainer → Stacks → Add stack →** entweder **Repository**:
- Repository URL: `https://github.com/fachwerk-home/fachwerk`
- **Repository reference: `refs/heads/main`** ← wichtig! Portainers Default
  (`master`) und ein blosses `main` schlagen mit „reference not found" fehl.
- Compose path: `docker-compose.beobachten.yml`

…oder **Web editor** (Inhalt von `docker-compose.beobachten.yml` einfügen).
In beiden Fällen: Environment `FACHWERK_KNX_HOST` = IP deines Routers (Pflicht).

**Eigenes Gewerk statt Beispiel:** im Compose die Mount-Zeile einkommentieren
(Host-Pfad!) und `FACHWERK_GEWERK=/gewerk` setzen.

### Fallstricke (teuer gelernt)

- **`build:` im Portainer-Stack ist eine Falle.** Portainer holt das Git-Repo neu,
  baut das Image aber **nicht** neu (`docker compose up` baut nicht, wenn ein Image
  des Namens existiert). Ergebnis: neues Compose, alter Code — Symptome wie
  „gewerk.yaml fehlt" oder fehlender Startbanner. Deshalb `image:` +
  `pull_policy: always`; dann macht „Pull and redeploy" genau das Richtige.
- **Relative Bind-Mounts ins geklonte Repo funktionieren nicht.** Portainer klont in
  seinen eigenen Container; der Docker-Daemon löst Bind-Mounts auf dem **Host** auf
  und legt bei fehlender Quelle stillschweigend ein *leeres* Verzeichnis an.
- **Restart alle 60 s = Dockers maximaler Backoff** → der Container crasht sofort und
  wiederholt. Ist der Startbanner nicht im Log, läuft alter Code.

Danach in beiden Fällen die **Logs** des `fachwerk`-Containers ansehen:
  ```
  RX  6/1/83 = true  → eg.kueche_spots          # echtes Telegramm
  [BEOBACHTUNG] würde senden  6/1/200 = true     # was die Logik täte (nicht gesendet)
  ```

Nichts wird an die Anlage geschrieben — der Modus ist doppelt verriegelt (Treiber-Flag +
kein Transmit). Zum späteren echten Betrieb einfach `FACHWERK_KNX_MODUS` entfernen — aber
das erst, wenn wir Guardrails (DEV/PROD, ADR-0009) und eine Visu haben.

## Grenzen (ehrlich)

- **Nur Konsole/Traces**, noch kein Dashboard — die sichtbare Rückmeldung ist Log/Trace.
  Ein Web-Status/Visu kommt später (ADR-0009 / Phase 5).
- Datenpunkte ohne bekannten Wert (noch kein Telegramm gesehen) tragen erst ab dem ersten
  Empfang einen Wert (ADR-0005: letzter bekannter Wert).
- Beobachtungsmodus ändert nichts an der Anlage — er ist ausdrücklich zum Zuschauen da.
