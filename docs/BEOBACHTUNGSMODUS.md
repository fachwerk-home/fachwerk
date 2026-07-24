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

## Eigenes Gewerk auf den Host bringen (ohne SSH)

Ein eigenes Gewerk gehört **nie** ins Repo oder Image: es enthält deine
Gruppenadressen, Raumnamen und ggf. Schriften/Bilder mit fremder Lizenz
(ADR-0015 D-4). Es kommt als Verzeichnis auf den Host und wird als Volume
gemountet — dafür ist `docker-compose.gewerk.yml` da.

**Packen** (auf dem Arbeitsrechner). Wichtig, wenn dort Windows läuft:

```bash
tar --owner=0 --group=0 --numeric-owner --mode='u=rwX,go=rX'     -czf fachwerk-gewerk.tar.gz -C <gewerk-verzeichnis> .
```

Ohne `--owner/--group` trägt das Archiv die Windows-UID (z. B. 197609). Beim
Entpacken als `root` versucht GNU-tar, diesen Eigentümer zu setzen, und bricht
ab: `Cannot change ownership to uid 197609 … Exiting with failure status`. Die
Dateien sind dann zwar da, aber der Exit-Status ist ≠ 0 — in einer Deploy-Kette
reißt das alles mit. Kontrolle: `tar -tvzf …` muss `0/0` zeigen.

**Übertragen ohne SSH** — zwei erprobte Wege:

- Über Proxmox: Archiv per Proxmox-UI in einen Storage laden, dann auf der
  **Proxmox-Host**-Shell `pct push <CTID> <archiv> /root/fachwerk-gewerk.tar.gz`.
- Über HTTP: auf dem Arbeitsrechner `python -m http.server 8899` im
  Download-Ordner, auf dem Zielhost `curl -O http://<arbeitsrechner>:8899/…`.
  Voraussetzung: die Firewall des Arbeitsrechners lässt den Port eingehend zu.

**Auspacken** auf dem Host:

```bash
sudo mkdir -p /opt/fachwerk/gewerk
sudo tar -xzf fachwerk-gewerk.tar.gz -C /opt/fachwerk/gewerk --no-same-owner
```

`--no-same-owner` ist die Notlösung für ein bereits übertragenes Archiv mit
Fremd-UIDs — dann muss nichts neu übertragen werden.

**Stack anlegen:** wie unten, aber Compose path `docker-compose.gewerk.yml` und
`FACHWERK_KNX_HOST` = IP des KNX-IP-Routers. Liegt das Gewerk woanders als
`/opt/fachwerk/gewerk`, zusätzlich `FACHWERK_GEWERK_HOST` setzen.

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

## Schreibpfad der API (P5-8) — Vertrag für UI-Clients

Der Schreibpfad ist **dreifach verriegelt**. Für den Beobachtungsmodus gilt dabei
die wichtigste Zusage unverändert: die Registry nimmt den Wert an (damit die Logik
reagiert und man sieht, was passieren *würde*), aber **kein Treiber sendet**.

```
POST /api/datenpunkte/<gruppe>.<key>
Authorization: Bearer <FACHWERK_API_TOKEN>
Content-Type: application/json

{"wert": true}
```

Antwort bei Erfolg (`200`):

```json
{"angenommen": true, "schluessel": "wohnen.licht", "wert": true, "geaendert": true,
 "hinweis": "beobachten: nicht auf den Bus gesendet"}
```

`hinweis` fehlt, wenn der zuständige Treiber wirklich sendet. **Eine UI muss diesen
Hinweis anzeigen** — sonst drückt jemand auf einen Schalter, sieht „angenommen" und
wundert sich, warum die Lampe dunkel bleibt.

| Code | Bedeutung | Fehlerform |
|---|---|---|
| 200 | angenommen | `{angenommen:true, …}` |
| 400 | Body ist kein JSON-Objekt mit `wert`, oder `wert` ist kein bool/zahl/text | `{angenommen:false, fehler}` |
| 401 | Token fehlt oder ist falsch (Transportschicht) | `{fehler}` |
| 403 | Schreibpfad aus (kein `FACHWERK_API_TOKEN` konfiguriert) **oder** Datenpunkt ist `protected` | `{angenommen:false, fehler}` |
| 404 | unbekannter Datenpunkt | `{angenommen:false, fehler}` |
| 413 | Body größer als 64 KB | `{angenommen:false, fehler}` |
| 422 | Typverstoß gegen die Datenpunkt-Definition | `{angenommen:false, fehler}` |
| 429 | Rate-Limit (`FACHWERK_API_SCHREIBLIMIT`, Default 30 pro 10 s, token-weit) | `{angenommen:false, fehler}` |

Weitere Zusagen, auf die sich eine UI verlassen darf:

- **Ohne `FACHWERK_API_TOKEN` existiert der Schreibpfad nicht** — nicht „offen für
  alle", sondern aus. Eine reine Lese-UI läuft also gefahrlos ohne Token.
- **`protected`-Datenpunkte** (Schlösser, Alarm, Tore, Zutritt) sind über die API
  **nie** schreibbar — zusätzlich lehnt die Registry sie selbst ab (zweite Schicht).
- **Der WebSocket bleibt read-only.** Kommandos über WS kommen frühestens mit P5-11.
- **Jeder Versuch wird protokolliert**, auch der abgelehnte: `audit.jsonl` im
  Datenverzeichnis (`FACHWERK_DATEN_DIR`), eine JSON-Zeile je Versuch
  (`{ts, schluessel, wert, quelle:"api", angenommen, grund?}`), append-only.
  **Keine Rotation in v1** — wer die Datei klein halten will, schneidet sie extern
  (z. B. `logrotate`); die Laufzeit kürzt sie nie selbst.
