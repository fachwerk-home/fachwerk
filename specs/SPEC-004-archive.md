# SPEC-004-archive: Archive & Zeitreihen

- **Status:** Entwurf (Implementiert in v1)
- **Quellen:** Zielspezifikation · Betreiberwissen · Forum (öffentlich)
- **Clean-Room-Erklärung:** Diese Spec beschreibt beobachtetes Verhalten und eigene
  Design-Entscheidungen. Kein Inhalt stammt aus EDOMI-Quellcode oder -Dokumentation.

## Zweck & Geltungsbereich

Datenlogging, Aggregation, Diagramme, Export, Aufbewahrung.
Die Archive ermöglichen das Mitschreiben von Datenpunkt-Werten als Zeitreihen.

## Definition im Gewerk

Archive werden deklarativ im Gewerk im Verzeichnis `archiv/*.yaml` definiert. Jede Datei exportiert eine Map von `Archiv-ID` auf die Definition:

- `name`: Anzeigename (Text)
- `quelle`: Der Schlüssel des Datenpunkts (z. B. `aussen.temperatur`). Darf nur auf Datenpunkte vom Typ `zahl` oder `bool` verweisen.
- `aufbewahrung_tage`: Lebensdauer der Rohdaten. Ältere Datenpunkte werden asynchron durch den `ArchivDienst` aufgeräumt.
- `mindestabstand_s` (optional): Rate-Limiting. Wenn gesetzt, werden neue Werte, die zu dicht am vorherigen Wert des gleichen Archivs liegen, still ignoriert.
- `notizen` (optional): Dokumentation für Betreiber.

Fehlende `archiv/` Verzeichnisse sind valide, die Plattform funktioniert auch ohne definierte Archive. Eindeutigkeit der Archiv-IDs ist über das gesamte Gewerk hinweg sichergestellt.

## Erfassungsregeln

Werte werden vom `ArchivDienst` in einer SQLite Datenbank im WAL-Modus erfasst (`archiv.sqlite`). Die Erfassung ist fehlertolerant ausgelegt, da der Prozess niemals durch externe Eingaben crashen darf:
- Nicht-numerische Werte oder unbekannte IDs werden still ignoriert und in einem Zähler (`ignoriertZaehler`) vermerkt.
- Boolesche Werte (`true`/`false`) werden automatisch in numerische Werte (`1`/`0`) gewandelt.
- Werte, die gegen den `mindestabstand_s` verstoßen, werden still ignoriert.

## Abfrage- und Aggregations-Semantik

Abfragen definieren zwingend eine Zeitspanne (`von`, `bis`). Bei `von > bis` wird eine leere Liste zurückgegeben.

### Roh-Abfrage
Erfolgt die Abfrage ohne Raster (`rasterS`), liefert sie exakt die erfassten Werte `[{ts, wert}]` innerhalb der Zeitspanne (Grenzen inklusive).

### Raster-Aggregation
Wird ein Raster (z. B. `rasterS = 60` Sekunden) vorgegeben, aggregiert der Dienst die Daten in Zeitfenster.
Unterstützte Aggregationen:
- `mittel` (Standard): Arithmetisches Mittel aller Werte im Fenster.
- `min`: Der kleinste Wert im Fenster.
- `max`: Der größte Wert im Fenster.
- `letzter`: Der chronologisch letzte Wert des Fensters.

Zusätzlich liefert das aggregierte Fenster-Objekt neben `wert` immer auch `min`, `max`, und `anzahl`.
**Leere Fenster werden ausgelassen** (keine implizite Null-Füllung).

## Aufbewahrung

Die Archivierung berücksichtigt die endliche Kapazität der Speichersysteme.
Die Methode `raeumeAuf()` wertet für jede Archiv-ID individuell `aufbewahrung_tage` aus. Punkte, deren Zeitstempel diese Aufbewahrungsdauer überschreiten, werden aus der SQLite-Datenbank entfernt.

Die Fenster liegen absolut auf der Epoche (`floor(ts / raster) * raster`), nicht relativ zu `von` — dieselbe Abfrage liefert damit unabhängig vom gewählten Ausschnitt dieselben Fenstergrenzen.

## Laufzeit-Verhalten

Beim Start lädt `fachwerk run` die Definitionen aus `archiv/*.yaml` und prüft sie gegen die Datenpunkte des Gewerks. **Ladefehler sind Warnungen, kein Startabbruch** — wie bei der Visu ist `fachwerk validate` das Gate; die Laufzeit läuft mit dem gültigen Teil weiter, damit ein Tippfehler in einer Archiv-Definition nicht die Gebäudesteuerung anhält.

Sind Archive definiert, öffnet die Laufzeit den `ArchivDienst` auf `archiv.sqlite` unterhalb von `FACHWERK_DATEN_DIR`. Die Zeitreihen liegen damit auf demselben Volume wie der übrige Zustand (ADR-0006) und überleben Container-Neustarts.

- **Erfassung:** Der Dienst hängt an der Datenpunkt-Registry. Erfasst wird bei *Wertänderung* eines Quell-Datenpunkts, mit dem Zeitstempel der Registry. Ein Datenpunkt darf mehrere Archive speisen; die Zuordnung Quelle → Archiv-IDs entsteht einmal beim Start. Feineres Rate-Limiting regelt `mindestabstand_s`.
- **Aufbewahrung:** `raeumeAuf()` läuft einmal beim Start (der Prozess kann tagelang gestanden haben) und danach alle 6 Stunden.
- **Herunterfahren:** Der Aufräum-Timer wird gestoppt und die Datenbank sauber geschlossen.

## HTTP-API

Beide Endpunkte gehören zur öffentlichen API (ADR-0009 A-1: die UI benutzt exakt diese Wege, keine privilegierten).

- `GET /api/archive` — Liste aller Archive mit `id`, `name`, `quelle`, `aufbewahrung_tage`, optional `mindestabstand_s` und der Anzahl gespeicherter `punkte`. Gewerk ohne Archive: leere Liste.
- `GET /api/archive/<id>?von&bis&rasterS&aggregation` — Zeitreihe. Defaults: `bis` = jetzt, `von` = `bis` − 24 h. Fehlt `rasterS`, wählt die API selbst ein Raster, das über die angefragte Spanne grob 1000 Punkte ergibt — eine 24-h-Rohabfrage würde einen Client sonst mit beliebig vielen Punkten überschütten. `rasterS=0` fordert ausdrücklich Rohdaten an. `aggregation` ist eine der oben genannten Stufen, Standard `mittel`.
- Unbekannte Archiv-IDs ergeben 404; nicht-numerische `von`/`bis`/`rasterS`, negatives Raster, `von` hinter `bis` und unbekannte Aggregationen ergeben 400 — die API rät nicht.
- `GET /api/status` enthält `archive: { anzahl }`.

## Offene Ausbaustufen (v2+)

- **Typ-Einschränkungen**: Aktuell können in v1 ausschließlich Werte der Typen `zahl` und `bool` archiviert werden. Die Speicherung von `text`-Werten (z. B. Enum-States als Text) ist noch nicht implementiert.
- **Verdichtungs-Stufen / Downsampling**: Aktuell existiert noch kein Downsampling zur persistenten Langzeitspeicherung (z. B. "hebe Rohwerte 7 Tage auf, danach Stundenmittelwerte für 1 Jahr"). Alles sind Rohdaten, Rasterung findet rein bei der Lese-Abfrage statt.
