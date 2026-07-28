# Fachwerk-SVG-Symbole

B-9 führt einen eingebauten, selbst gezeichneten Linien-Symbolsatz für neue
Visus ein. Ein Element kann mit `symbol: <name>` ein SVG in der Textfarbe des
wirksamen Designs (`currentColor`) anzeigen. Das Feld ist für alle Presets
erlaubt; bei `preset: symbol` ist es der Hauptinhalt, bei anderen Presets eine
Beigabe links vom Text.

Die geschlossene, maschinenlesbare Liste steht im Schema
`schema/schemas/visu-seite.schema.json` unter `$defs.symbol`.

Beispiel:

```yaml
elemente:
  licht:
    preset: schalter
    text: Decke
    symbol: licht_an
    design: standard
```

## Galerie

| Name | Bild / Motiv |
|---|---|
| `alarm` | Warndreieck |
| `anwesenheit` | Person |
| `diagramm` | Balkendiagramm |
| `einstellungen` | Zahnrad |
| `etage` | Etagenhaus |
| `fenster_gekippt` | gekipptes Fenster |
| `fenster_offen` | offenes Fenster |
| `fenster_zu` | geschlossenes Fenster |
| `glocke` | Glocke |
| `haus` | Haus |
| `heizung` | Heizkörper |
| `info` | Info-Kreis |
| `jalousie` | Lamellen |
| `licht_an` | leuchtende Lampe |
| `licht_aus` | durchgestrichene Lampe |
| `licht_dimmer` | Lampe mit Dimm-Strahlen |
| `luftfeuchte` | Tropfen |
| `luefter` | Ventilator |
| `minus` | Minus |
| `mond` | Mond |
| `pfeil_hoch` | Pfeil nach oben |
| `pfeil_links` | Pfeil nach links |
| `pfeil_rechts` | Pfeil nach rechts |
| `pfeil_runter` | Pfeil nach unten |
| `plus` | Plus |
| `regen` | Wolke mit Regen |
| `rollo_ab` | Rollo abwärts |
| `rollo_auf` | Rollo aufwärts |
| `rollo_position` | Rollo mit Positionsanzeige |
| `rollo_stopp` | Rollo mit Stoppsymbol |
| `raum` | Raumrechteck |
| `schloss_offen` | offenes Schloss |
| `schloss_zu` | geschlossenes Schloss |
| `szene` | Szenenkarte |
| `sonne` | Sonne |
| `steckdose` | Steckdose |
| `temperatur` | Thermometer |
| `thermostat` | Thermostat |
| `timer` | Timer |
| `tuer_offen` | offene Tür |
| `tuer_zu` | geschlossene Tür |
| `uhr` | Uhr |
| `wind` | Windlinien |
| `wolken` | Wolke |

Der Satz ist projekt-eigen gezeichnet; es gibt keine fremde Icon-Lizenz oder
Betreiber-Beilage.
