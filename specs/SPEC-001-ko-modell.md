# SPEC-001: Datenpunkt-Modell

- **Status:** Entwurf (Zielspezifikation)
- **Bezug:** GLOSSAR (Datenpunkt), ADR-0004 (Gewerk-Format), Plan § 4.2 (protected)

## Zweck & Geltungsbereich

Der **Datenpunkt** ist Fachwerks zentrale Abstraktion: Datenträger und Ereignisquelle
zwischen Treibern (Bus/Fremdsysteme), Logik und Visualisierung.

## Zielmodell

### Klassen
- **Intern** — rein innerhalb Fachwerks, keine Bus-Bindung; frei anlegbar, in Ordner/
  Namensräume gruppierbar. Bevorzugtes Mittel für busfreie Logik.
- **Bus-gebunden** — an eine Treiber-Adresse gebunden (z. B. KNX-Gruppenadresse, MQTT-Topic).
- **System** — von Fachwerk bereitgestellte Zustände (z. B. Treiberstatus, Systemzeit).

### Eigenschaften je Datenpunkt
- **Schlüssel** — stabil, menschenlesbar (ADR-0004), eindeutig je Gewerk.
- **Name** — frei.
- **Typ** — generischer Variant **oder** typisiert (DPT/typisierter Wert). Typisierung wird
  gefördert (bessere Validierung, bessere Agenten-/Editor-Unterstützung).
- **Initialwert**.
- **Remanenz-Flag** — steuert, ob der Wert einen Neustart überlebt (Persistenz pro
  Datenpunkt); nicht-remanente Werte leben nur im Speicher.
- **Filter/Normalisierung** an der Datenpunkt-Grenze (greifen VOR der Logik):
  Minimum/Maximum, Raster (Quantisierung), Nachkommastellen, Wertliste.
- **`protected`** — Klasse für Schlösser/Alarm/Tore/Zutritt: nie durch Agenten oder
  Bausteine schreibbar, Freigabe nur über Admin-Rolle (Plan § 4.2, ADR-0008/0009).
- **Typvalidierung:** Eingehende Werte werden gegen den Typ geprüft; Abweichungen sind
  sichtbare Ereignisse (Trace/Zähler), Verhalten (maskieren/verwerfen/klemmen) pro
  Datenpunkt konfigurierbar mit dokumentiertem Default — nie stilles Verbiegen.

## Akzeptanzkriterien

- Datenpunkt-Schema (JSON) mit: key, name, klasse, typ, initial, remanent,
  filter{min,max,raster,decimals,valuelist}, protected, notizen.
- Round-trip-Test: anlegen → Wert setzen → lesen → Filter/Validierung greifen wie
  spezifiziert.
