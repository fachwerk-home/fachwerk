# Gewerk importieren — direkt auf dem Docker-Host

Der Import läuft im selben Container-Image wie die Laufzeit. Damit entfällt
„lokal importieren und dann irgendwie kopieren": Exportdateien auf den Host,
Stack starten, fertig.

## Einmalig vorbereiten

```bash
sudo mkdir -p /opt/fachwerk/quellen /opt/fachwerk/gewerk-neu
```

## Bei jedem Import — drei Schritte

**1. Exportdateien nach `/opt/fachwerk/quellen` legen.** Die Dateinamen sind
egal, sie werden gefunden:

| Datei | woher | Pflicht |
|---|---|---|
| `*.sql` | Datenbank-Dump der Altanlage (siehe unten) | ja |
| `*.tar` | Visu-Export **als Paket** — bringt Schriften und Bilder mit | empfohlen |
| `*.json` | Visu-Export ohne Beilagen (Symbole bleiben dann leer) | Ersatz |

Liegen mehrere passende Dateien da, nimmt der Import die erste alphabetisch und
sagt im Log, welche.

**2. Stack starten.** Portainer → Stacks → Add stack → Repository:

- Repository URL: `https://github.com/fachwerk-home/fachwerk`
- Repository reference: `refs/heads/main`
- Compose path: `docker-compose.import.yml`

Der Stack läuft **einmal** durch und bleibt gestoppt. Das Log zeigt, was
konvertiert wurde und was offen ist; dasselbe steht als `MIGRATION.md` im
erzeugten Gewerk.

**3. Ergebnis übernehmen.** Das Gewerk landet in `/opt/fachwerk/gewerk-neu` —
**nicht** im laufenden Verzeichnis. Das ist Absicht: ein Import überschreibt
alles, auch von Hand oder im Editor nachgebesserte Stellen. Erst schauen, dann
übernehmen:

```bash
diff -rq /opt/fachwerk/gewerk /opt/fachwerk/gewerk-neu   # was ändert sich?
sudo rm -rf /opt/fachwerk/gewerk.alt
sudo mv /opt/fachwerk/gewerk /opt/fachwerk/gewerk.alt    # Rückweg behalten
sudo mv /opt/fachwerk/gewerk-neu /opt/fachwerk/gewerk
```

Danach den Betriebs-Stack (`docker-compose.gewerk.yml`) neu starten, damit er
das frische Gewerk lädt.

## Schreibrechte einrichten — einmalig, sonst geht der Import nicht

Fachwerk startet **ohne Schreibrechte**: solange kein Nutzer angelegt ist, ist
jeder Besucher anonym und darf nur lesen. Der Menüpunkt „Import" ist dann
sichtbar, aber die Knöpfe sind grau mit dem Hinweis *„Scope write:gewerk
fehlt"*. Das ist kein Fehler, sondern die Voreinstellung — ein frisch
gestartetes Fachwerk kann niemand von außen umbauen.

Freischalten (einmal pro Anlage, im laufenden Container):

```bash
C=$(docker ps -qf name=fachwerk)
printf 'DEIN-PASSWORT
' | docker exec -i "$C" node cli/src/main.ts   nutzer anlegen junig --scopes read,operate,write:gewerk,activate:dev
docker restart "$C"
```

Das `node cli/src/main.ts` davor muss sein: `docker exec` startet das Kommando
direkt und geht **nicht** durch den ENTRYPOINT des Images — ein blosses
`docker exec ... nutzer anlegen` endet in `executable file not found`.

Der Nutzer liegt in `/daten/nutzer.yaml` (benanntes Volume, übersteht Updates).
Die vier Scopes bedeuten: lesen · schalten · Gewerk ändern · aktivieren. Wer
nur zuschauen soll, bekommt `--scopes read` — das ist auch der Default-Gedanke:
knapp anfangen, nachlegen.

**Was sich damit ändert — vorher wissen:** ab dem ersten Nutzer ist die Auth
scharf, und zwar für alles. Auch das Panel und das Handy verlangen dann eine
Anmeldung. Das ist ein Login pro Gerät, danach hält das Cookie **30 Tage**.
Wer das nicht will, importiert über den Portainer-Stack oben — der braucht
keine Anmeldung, weil er gar nicht über die API geht.

## Ohne Konsole: über die Oberfläche

Dieselben Schritte gehen auch über die laufende Instanz — dann muss nichts auf
den Host kopiert werden:

```bash
T="Authorization: Bearer <token>"; B=http://<host>:8300
curl -X POST -H "$T" --data-binary @projekt-dump.sql   "$B/api/gewerk/quellen/projekt-dump.sql"
curl -X POST -H "$T" --data-binary @visu-export.tar    "$B/api/gewerk/quellen/visu-export.tar"
curl -X POST -H "$T" "$B/api/gewerk/import"              # erzeugt das Gewerk daneben
curl -X POST -H "$T" "$B/api/gewerk/import/uebernehmen"  # ersetzt + aktiviert
```

Auch hier gilt der Zweischritt: `import` rührt das laufende Gewerk nicht an,
erst `uebernehmen` schaltet um (und legt den Vorgänger als `<gewerk>.alt` ab).
Der Menüpunkt **„Import"** in der Admin-UI benutzt genau diese Routen und ist
der bequemste Weg: Dateien ablegen (Auswahl oder Ziehen-und-Ablegen),
*Importieren*, Bericht lesen, *Übernehmen und aktivieren*. Der curl-Weg oben
bleibt für Skripte und Agenten.

## Woher kommt der `.sql`-Dump?

Der Visu-Export liefert das Export-Modul der Altanlage direkt. Der
Datenbank-Dump entsteht aus dem Anlagen-Backup (`.edomibackup`, ein tar mit dem
MySQL-Datenverzeichnis). Vorgehen — **Nutzdaten, kein Code**:

```bash
cd /opt/fachwerk/quellen
# 1. Nur das Datenverzeichnis aus dem Backup holen
tar -xf <anlage>.edomibackup var/lib/mysql

# 2. Wegwerf-Datenbank darauf ansetzen und die Nutzdaten-Tabellen dumpen
docker run --rm -d --name fw-dump \
  -v "$PWD/var/lib/mysql:/var/lib/mysql" \
  -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 mariadb:10.11
sleep 20   # bis die Datenbank oben ist

docker exec fw-dump mariadb-dump --default-character-set=latin1 \
  edomiLive editKo editRoot \
  editLogicPage editLogicElement editLogicElementDef \
  editLogicElementDefIn editLogicElementDefOut \
  editLogicLink editLogicCmdList > projekt-dump.sql

docker rm -f fw-dump
sudo rm -rf var   # das Datenverzeichnis wird nicht mehr gebraucht
```

Gedumpt werden **ausschließlich diese Tabellen** — Konfigurationsdaten der
Anlage (Kommunikationsobjekte, Verdrahtung, Seiten). Weder Programmcode noch
Laufzeitdaten. Das ist die Clean-Room-Linie des Projekts, und sie ist hier kein
Zufall, sondern die Liste oben.

## Wenn etwas schiefgeht

| Meldung | Bedeutung |
|---|---|
| `keine .sql-Datei in /quellen gefunden` | Dump fehlt oder liegt woanders |
| `Dump enthält keine editKo-Tabelle` | falsche Datei oder Tabellen fehlen im Dump |
| `Paket enthält keine Export-JSON` | das `.tar` ist kein Visu-Export |
| `erzeugtes Gewerk ist nicht schema-konform` | Fehler im Importer — bitte melden, mit dem Log |
| Knöpfe grau, „Scope write:gewerk fehlt" | kein Nutzer angelegt → Abschnitt „Schreibrechte einrichten" |
| `EROFS: read-only file system` | Gewerk-Volume steht auf `:ro` — der aktuelle Compose-Stand mountet es beschreibbar |
| `exec: "nutzer": executable file not found` | `node cli/src/main.ts` im docker-exec-Aufruf vergessen |

Der Import schreibt nur bei Erfolg ein vollständiges Gewerk; er prüft sein
eigenes Ergebnis (`validate` plus Visu-Laden), bevor er OK meldet.
