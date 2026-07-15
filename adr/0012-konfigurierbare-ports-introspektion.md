# ADR-0012: Konfigurierbare Baustein-Ports & Datenintrospektion

- **Status:** Akzeptiert (2026-07-15)
- **Datum:** 2026-07-15
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)
- **Erweitert:** ADR-0008 (Baustein-Modell), ADR-0005 (Ausführung), SPEC-003 (Editor)

## Kontext

Das Referenzsystem hat eine große Familie von **N:M-Bausteinen** mit fest verdrahteter
Port-Anzahl („String zerteilen 10-fach", „Strings verbinden 10-fach", „JSON Extractor" mit
10 Selektorpfaden …). Diese fixe Arität ist kein Design, sondern ein **Workaround**: die
Plattform konnte Ports nur zur Bauzeit des *Bausteintyps* festlegen, also baute man 10 und
verschenkte den Rest — mit dem Nebeneffekt, dass für dasselbe Muster mehrere Varianten
existieren mussten.

Fachwerk erbt diese Fessel nicht. Zwei Beobachtungen:
1. Die **Arität** eines Bausteins hängt oft von seiner **Konfiguration** ab, nicht von
   seinem Typ (wie viele Felder extrahiere ich, in wie viele Teile zerlege ich).
2. **JSON/XML sind selbstbeschreibend** — der Editor (und ein Agent) kann die verfügbaren
   Felder aus einem Beispiel ablesen und zum Anklicken anbieten, statt Pfade blind zu tippen.

Kraftfeld: ADR-0005 verlangt, dass die Ports **vor** der Kaskade feststehen (für die
topologische Sortierung). „Vorher" heißt aber **Projektierungszeit**, nicht „im Typ
einbetoniert".

## Optionen

- **Feste Arität übernehmen (EDOMI-Weg):** einfachster Code, aber Verschwendung und
  N:M-Baustein-Wildwuchs; verfehlt Fachwerks Anspruch.
- **Voll dynamische Ports zur Laufzeit:** bricht ADR-0005 (Ordnung nicht statisch prüfbar).
- **Konfig-abgeleitete Ports, statisch zur Projektierungszeit (gewählt):** Ports ergeben
  sich aus der Instanz-Konfiguration; sie sind fix, sobald das Gewerk aktiviert wird.

## Entscheidung

### K-1: Ports dürfen aus der Instanz-Konfiguration abgeleitet werden
Ein Baustein deklariert seine Ports **entweder** fest im Manifest (wie bisher, ADR-0008 S-1)
**oder** über eine reine Funktion `ports(parameter) → { eingaenge[], ausgaenge[] }`. Die
abgeleiteten Ports sind **statisch zur Projektierungszeit** (aus der im Gewerk gespeicherten
Config berechenbar) — ADR-0005 bleibt vollständig gültig: Der Graph-Builder kennt alle Ports
vor jeder Kaskade. Eine Mapping-Änderung ist eine **Config-Änderung** (neuer Deploy/
Aktivierung nach ADR-0009), nie eine Laufzeit-Mutation.

### K-2: Ein konfig-variabler Baustein statt einer N:M-Familie
Jedes „N-fach"-Muster kollabiert auf **einen** Baustein mit konfigurierbarer Arität. Beispiel
EXTRACT:
```yaml
baustein: EXTRACT
parameter:
  format: json
  felder:
    - { name: temp,  pfad: main.temp }
    - { name: stadt, pfad: name }
# ⇒ Ausgänge: temp, stadt, status  (genau so viele wie gemappt)
```
Kein Verschnitt, sprechende Portnamen, keine Variantenexplosion.

### K-3: Datenintrospektion für Editor UND Agent
Ein Baustein, dessen Quelle strukturiert ist, deklariert optional
`introspizieren(beispiel, parameter) → Feldbaum`. Der **Editor** (SPEC-003) liest ein
Beispiel — Live-Wert des gebundenen Datenpunkts oder eingefügter Text — und zeigt den Baum:
Feld anklicken ⇒ benannter Ausgang mit passendem Pfad entsteht. Man **sieht, was man
mappt.** Dieselbe Funktion nutzt ein **Agent** (Agent-first, Plan § 4.1), um Mappings ohne
Ratearbeit zu erzeugen. Introspektion ist rein und seiteneffektfrei (nur Lesen des Beispiels).

### K-4: Sinnvolle Defaults, unbegrenzte Erweiterung
Ein konfig-variabler Baustein startet in der Palette mit **wenigen** vorbelegten Ausgängen
(z. B. 2–3), damit er sofort nutzbar ist; der Nutzer/Agent fügt beliebig viele hinzu. Die
Grenze ist Bedarf, nicht Bausteintyp.

### K-5: Validierung folgt den deklarierten Ports
Wo `ports()`/Manifest die Portmenge kennen, prüft die Projektierungszeit-Validierung Kanten
gegen diese Menge (unbekannter Port = Fehler mit Ort). Bausteine ohne Port-Deklaration
bleiben „offen" verkabelbar (Rückwärtskompatibilität, u. a. Skeleton/Import-Entwürfe).

## Konsequenzen

- **Die ganze N:M-Familie verschwindet** — ein Baustein je Muster, konfig-variabel. Großer
  Gewinn für Portierung (Import mappt Selektoren → Felder) und Bedienung.
- **Selbstdokumentierend:** Feldpicker aus echten Daten statt Pfad-Raten; identisch für
  Mensch und Agent.
- **ADR-0005 unangetastet:** Ports statisch zur Projektierungszeit; Remapping = Deploy.
- **Kosten:** Baustein-Interface + Manifest wachsen (optionale `ports()`/`introspizieren()`);
  Graph-Builder rechnet Ports aus Config; Editor-Feldpicker ist echte Arbeit (SPEC-003).
- **Berührt:** ADR-0008 (S-1 Manifest um konfig-abgeleitete Ports + Introspektions-Fähigkeit
  ergänzt), SPEC-003 (Feldpicker als Editor-Anforderung), Importer (N-fach-LBS → ein
  konfig-variabler Baustein).
- **Offen:** genaues Manifest-Schema für konfig-abgeleitete Ports und die Feldbaum-
  Datenstruktur werden mit dem Editor (Phase 5) finalisiert; hier zunächst als
  Stdlib-Konvention (EXTRACT) umgesetzt.
