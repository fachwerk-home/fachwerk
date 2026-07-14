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
- **Filter/Normalisierung** an der Datenpunkt-Grenze (greifen VOR der Logik, verändern den
  **semantischen** Wert): Minimum/Maximum, Raster (Quantisierung), Nachkommastellen, Wertliste.
- **Darstellungs-Format** (nur Anzeige, verändert den Wert NICHT — ADR-0011, FMT-4): der
  Datenpunkt ist die **Heimat** des Formats (Power-BI-Prinzip „einmal setzen, überall gleich").
  Element und Platzierung (Breakpoint) dürfen einzelne Aspekte überschreiben (Kaskade
  Datenpunkt → Element → Platzierung, siehe SPEC-003 R-10 / ADR-0010 L-1). Der Roh-/
  Semantikwert (Logik, Archive, Bus) bleibt unberührt. Deklarative **Felder** je Typ:

  | Typ | Format-Felder |
  |---|---|
  | **Zahl** | `einheit` (Suffix) · `praefix` · `dezimalstellen` · `skalierung`+`offset` (linear Roh→Anzeige) · `tausendertrenner` · `leerwert` |
  | **Bool** | `bool-map` {true→Text/Icon, false→Text/Icon} · `leerwert` |
  | **Enum** | `enum-map` {wert→Text/Icon, …} · `fallback` (unbekannter Wert) · `leerwert` |
  | **String** | `praefix`/`suffix` · `max_laenge`+`ellipsis` · `leerwert` |
  | **Zeit/Datum** | `muster` (Preset `HH:mm`/`dd.MM.yyyy`/`dd.MM. HH:mm` oder eigenes) · `modus` absolut/relativ · `leerwert` |

  **Wichtige Abgrenzung:** `dezimalstellen` (Format) rundet nur die **Anzeige**; die
  `decimals`-Quantisierung unter Filter/Normalisierung rundet den **gespeicherten** Wert.
  Beide existieren, die UI benennt sie getrennt („Anzeige-Nachkommastellen" vs. „Wert
  quantisieren"). **Bool** ist intern ein 2-Werte-Enum (`bool-map` ist der bequeme
  Sonderfall). **Skalierung** wird kanonisch als `skalierung`(Faktor)+`offset` gespeichert;
  der Editor bietet einen Helfer „von Rohbereich [a..b] auf [c..d]" (rechnet den Faktor aus).
  Für echte Komposition steht optional die Ausdruck-Teilmenge bereit (FMT-3, SPEC-003 R-10);
  auf Datenpunkt-Ebene darf ein Ausdruck nur `#` (self) referenzieren, nie `#{andere}`.
- **`protected`** — Klasse für Schlösser/Alarm/Tore/Zutritt: nie durch Agenten oder
  Bausteine schreibbar, Freigabe nur über Admin-Rolle (Plan § 4.2, ADR-0008/0009).
- **Typvalidierung:** Eingehende Werte werden gegen den Typ geprüft; Abweichungen sind
  sichtbare Ereignisse (Trace/Zähler), Verhalten (maskieren/verwerfen/klemmen) pro
  Datenpunkt konfigurierbar mit dokumentiertem Default — nie stilles Verbiegen.

## Akzeptanzkriterien

- Datenpunkt-Schema (JSON) mit: key, name, klasse, typ, initial, remanent,
  filter{min,max,raster,decimals,valuelist},
  format{…typabhängige Felder gem. Tabelle…}, protected, notizen.
- Format-Kaskade greift wie spezifiziert (Datenpunkt-Default, ohne Element-/Platzierungs-
  Override); Roh-/Semantikwert bleibt unverändert.
- Abgrenzungstest: Format-`dezimalstellen` ändert nur die Anzeige, Filter-`decimals` ändert
  den gespeicherten Wert — beide unabhängig wirksam.
- Round-trip-Test: anlegen → Wert setzen → lesen → Filter/Validierung greifen wie
  spezifiziert.
