# SPEC-003: Visu-Elemente, Seitenmodell & Editor

- **Status:** Anforderungs-Rahmen (Detail-Ausarbeitung steht noch aus)
- **Quellen:** Community-Katalog (★★★) · Betreiberwissen · Konfigurations-Beobachtung ·
  eigene Design-Entscheidungen
- **Clean-Room-Erklärung:** Beschreibt Anforderungen und eigene Design-Entscheidungen. Kein
  Inhalt aus EDOMI-Quellcode oder -Dokumentation.

## Zweck & Geltungsbereich

Visualisierungsseiten, Elementtypen, Templates/Instanzen, Zustandsbindung an Datenpunkte
(KOs), Responsive-Varianten — und der **Editor** dafür.

## Anforderungen (aus Community + Betreiber)

### R-1: Pixelgenauer No-Code-Editor (Kern-USP, ★★★)
Freie, pixelgenaue Positionierung von Elementen ohne Code — „5-Minuten-Dashboards"
(Community-Katalog). Das ist DER Grund, warum Nutzer einen pixelgenauen Editor der
HA-Template-Bastelei vorziehen. Muss Fachwerk mindestens erreichen.

### R-2: Direkte Manipulation / Drag-and-Drop (siehe BACKLOG B-3)
Klassische KNX-Visu-/Logikeditoren werden oft fast ausschließlich über
**Rechtsklick/Kontextmenü** bedient — kein Drag-and-Drop zum Einfügen/Verbinden von
Elementen, Bausteinen, Datenpunkten. Fachwerk-Editor: Palette → Ziehen, Verbindungen
ziehen, Datenpunkt per Drag zuweisen, Mehrfachauswahl, Raster/Snap, Ausrichten. Direkte
Manipulation als Default, Kontextmenü nur ergänzend.

### R-3: Responsive (★★) — Modell festgelegt in ADR-0010
Pixelfixe Visus müssen je Endgerät nachgebaut werden. Fachwerks Antwort (ADR-0010):
**Element-Identität von Platzierung trennen** — ein Element existiert einmal (Bindungen/
Verhalten), trägt aber 0..n **Platzierungen** je Breakpoint (Position/Größe/Sichtbarkeit/
Format). Zwei Modi über demselben Modell: **Canvas/Pinned** (Power-BI-Weg, v1-Primär:
Tablet bauen → auf Smartphone vorhandene Elemente übernehmen und anpassen → zweites Gerät ist
Derivat, kein Nachbau) und **Flow/Auto** (Model-driven-Weg, Container/Raster, automatisch
responsiv, Nachzügler). Mischbar (Auto-Default + einzelne gepinnte Elemente). So bleibt
pixelgenaue Kontrolle erhalten UND „pro Gerät neu bauen" entfällt.

### R-4: Templates / Objekt-Instanzen mit globaler Änderung (★★)
Ein Element/Baustein als Vorlage, viele Instanzen; Änderung an der Vorlage wirkt global.
(Community: oefchen/scw2wi.)

### R-5: Editor = Ansicht auf das Textprojekt (Agent-first, Plan § 4.1)
Jede Editor-Aktion (Drag, Positionierung, Bindung) erzeugt/ändert die **deklarativen
Projektdateien**. Mensch (Maus) und Agent (Text/API/MCP) bearbeiten dasselbe Modell. Das
ist die Grundlage für B-2 (Git-Historie/Diff) und für „Agent baut Visu ohne Friction".

### R-6: Zustandsbindung an Datenpunkte
Elemente binden an Datenpunkte (SPEC-001): Wert anzeigen, Aktion senden,
Sichtbarkeit/Farbe/Icon dynamisch. Klare, deklarative Bindungssyntax statt eingebettetem
Code (Gegenmodell zu HA-Templates).

### R-7: Konfigurationstiefe zähmen (Betreiber-Schwachpunkt, wichtig)
Klassische Visu-/Archiv-Konfiguration ist oft **unnötig komplex**: Die Optionen hängen stark
vom Elementtyp ab, es gibt viele datenpunkt-gesteuerte Stellschrauben und zusätzliche
Menüpunkte (Farben, Makros …). Bei **Datenarchiven** (Verlaufsanzeigen, oft von Logiken
gefüttert) muss man teils **mehrere Menüs tief** einsteigen, um einen einzigen Wert
zuzuweisen — eine Schwäche, die aus der schieren Optionsmenge entsteht (Betreiber-Feedback).
*Design-Vorgabe Fachwerk:* **Progressive Disclosure** — häufige Einstellungen flach und
sofort erreichbar, Seltenes hinter „Erweitert". Sinnvolle Defaults, damit ein Element ohne
Tieftauchen funktioniert. Konfiguration als deklarativer Text (Agent-first) mit
schema-getriebener, kontextsensitiver UI statt tiefer, elementabhängiger Menübäume.
Datenarchiv-Anbindung („dieser Wert in dieses Archiv") muss **ein** Schritt sein, nicht fünf.

### R-8: Mehrere Datenpunkt-Bindungen pro Element mit klaren Rollen
Ein Element bindet oft an **mehrere** Datenpunkte in unterschiedlichen Rollen — anzeigen,
bei Interaktion setzen, und den **Status** (für dynamische Darstellung) lesen. Fachwerk:
benannte Binding-Rollen (z. B. `display`, `set`, `status`) statt kryptischer nummerierter
Slots; deklarativ, für Mensch und Agent lesbar.

### R-9: Dynamische Darstellung (Style je Wert)
Aussehen (Farbe, Icon, Design) soll sich **automatisch nach einem Datenpunkt-Wert** ändern
(z. B. an=hell/aus=dunkel, Schwellwerte). Deklarative Wert→Style-Zuordnung — der Standardweg
für Statusanzeige, ohne Code.

### R-10: Wertformatierung — Kaskade, festgelegt in ADR-0011
Format **kaskadiert Datenpunkt → Element → Platzierung** (spezifischere Ebene gewinnt):
Der **Datenpunkt** ist die Heimat des Defaults (Einheit, Dezimalstellen, Skalierung/Offset,
Enum-/Bool-Map — Power-BI-Prinzip „einmal setzen, überall gleich", siehe SPEC-001). Ein
**Element** und eine **Platzierung** (Breakpoint) dürfen einzelne Aspekte überschreiben —
z. B. Tablet 1 Nachkommastelle, Smartphone ganzzahlig. Alles über **Felder**, kein Ausdruck
im Normalfall. Für echte Komposition (Textverkettung, bedingter Text) gibt es eine kleine,
dokumentierte Ausdruck-Teilmenge als Fluchtweg (FMT-3) — bewusster Gegenentwurf zur „für
alles ein Template"-Kritik. Format wirkt nur auf die Anzeige, nie auf den Semantikwert.
Ausdruck-Teilmenge = **Template-Text mit `{…}`-Löchern** (Text außen literal, Ausdruck im
Loch), `concat(...)` fürs Textkleben, feste kleine Funktionsliste — Details im **Anhang A**.

### R-12: Datenfeld-Picker für konfig-variable Bausteine (ADR-0012)
Bausteine, die strukturierte Daten lesen (JSON/XML), stellen eine
**Introspektion** bereit: Der Editor liest ein Beispiel (Live-Wert des gebundenen
Datenpunkts oder eingefügter Text), zeigt den **Feldbaum** und der Nutzer klickt ein Feld
an ⇒ ein benannter Ausgang mit passendem Pfad entsteht. Man sieht, was man mappt, statt
Pfade blind zu tippen. Ports sind konfig-abgeleitet (so viele Ausgänge wie gemappte Felder),
nicht fest. Dieselbe Introspektion nutzt ein Agent (Agent-first). Gilt für den Logik- wie
den Visu-Editor.

### R-11: Struktur — Gruppen/Ebenen und Seitentypen
Elemente in **Gruppen** (benannte Layer/Container) organisierbar, mit Ebenenreihenfolge
(Z-Index). Seitentypen: normale Seite, **Popup/Overlay**, und **Include-/Master-Seite**
(gemeinsames Layout, in andere Seiten eingebunden). Navigation (Seite/Popup öffnen/schließen)
direkt an Elementen konfigurierbar.

## Elementtyp-Zielkatalog v1 (F-1, festgelegt)

**Architektur-Grundsatz — wenige echte Typen:** Statt vieler Spezialelemente gibt es **ein**
flexibles Basiselement. Was wie „Schalter"/„Taster"/„Wertanzeige" aussieht, sind
**Presets** (Voreinstellungen) desselben Elements — in der Palette als freundliche Kacheln,
unter der Haube ein Typ. Eigenen Typ bekommt nur ein Widget, dessen Render-/
Interaktionsmodell wirklich anders ist (Ziehen, Zeitreihe, Wiederholzeilen, Einbettung).

**Presets sind Startpunkte, kein Korsett (Multi-Rollen-Prinzip):** Dank der Bindungsrollen
(R-8) trägt **ein** Element mehrere Rollen gleichzeitig — Steuern (`set`), Anzeigen
(`display`) und Status (`status`) in **einer** kompakten Kachel (wie in FHEM üblich, wo ein
tief konfiguriertes Element Schalten + Wert + Status vereint). Ein Preset setzt nur sinnvolle
Defaults; Rollen lassen sich auf demselben Element schichten.

**A) Presets des Basiselements** (Config, kein eigener Code):

| Preset | Tut | Rollen |
|---|---|---|
| Taster | sendet bei Druck (z. B. 1) | `set` |
| Schalter/Toggle | schaltet 0/1, zeigt Zustand | `set` + `status` |
| Statusanzeige | nur Anzeige, Design je Wert (R-9) | `status` |
| Wertanzeige | Zahl/Text mit Format-Kaskade (R-10) | `display` |
| Label | statischer oder Datenpunkt-Text | `display` (optional) |
| Symbol/Icon | Icon wechselt je Wert | `status` |
| Navigations-Button | Seite/Popup öffnen/schließen | — |

**B) Spezial-Widgets** (eigener Typ, eigenes Render/Interaktion):

| Widget | Tut | Rollen |
|---|---|---|
| Schieberegler (Slider) | stufenlos setzen + anzeigen | `display` + `set` |
| Dimmer/Farbe | RGB/HSV-Picker | `display` + `set` |
| Jalousie/Rollladen | auf/stopp/ab + Position (kuratiertes Composite) | mehrfach `set` + `status` |
| Diagramm | Zeitreihe aus Datenarchiv | `display` (Archiv-Quelle) |
| Liste/Tabelle | Wiederholzeilen (auch Meldungsarchiv) | `display` (Sammlung) |
| Bild/Webseite (iframe) | externe URL einbetten | URL (statisch/`display`) |
| Kamera | MJPEG/Snapshot-Stream | Stream-Quelle |

**C) Eigene Elemente:** v1 = **gespeicherte Vorlagen** (R-4) — ein konfiguriertes Element
oder eine Gruppe als wiederverwendbares Preset (Änderung an der Vorlage wirkt global). Echte
Plugin-Widgets (fremder Render-Code) sind ein späterer Stufe-2-Weg über die Baustein-/
Sandbox-Schiene (ADR-0008).

**Bewusst NICHT in v1:**
- **Zeitschaltuhr, Terminschaltuhr, Anwesenheitssimulation** — das ist **Logik**
  (Timer = ADR-0005 E-8, Anwesenheit = B-4), nicht Visu; die Visu zeigt/steuert nur die
  dahinterliegenden Datenpunkte. Kein eigener Visu-Typ.
- **Analoguhr, Skizze, Notizen, Codeschloss, Touchpad, Drehregler, Sprachausgabe, Ton-URL,
  Kamera-/Anrufarchiv** — Nischen; kommen als Presets/Widgets nach Nachfrage nach.

## Offene Fragen

- F-2/F-3/F-4 sind durch R-8 (Bindungsrollen), R-9 (dynamische Darstellung), R-11 (Gruppen/
  Z-Index/Seitentypen) und den F-1-Katalog adressiert; Detail-Schemata folgen mit Phase 3.
- F-5: Migrations-Mapping bestehender Elementparameter (Import-Assistent Phase 6) — offen.

## Nächster Schritt

Elementtyp-Zielkatalog v1 steht (F-1). Detail-Schemata (Basiselement-Felder je Rolle,
Widget-Parameter) entstehen mit Phase 3 am laufenden Code; Migrations-Mapping (F-5) mit dem
Import-Assistenten in Phase 6.

## Anhang A: Ausdruck-Teilmenge für Format-Templates (ADR-0011 FMT-3)

Der Fluchtweg für Formatierung, wenn die Felder (R-10 / SPEC-001) nicht reichen. Bewusst
klein, **pur** (keine Seiteneffekte) und **total** (Fehler → definierter Fallback, nie
Crash). Kein `now()`/Zufall, kein `eval` (eigener Parser), Auswertung nur bei Wertänderung.

**Fläche = Template-Text mit Löchern.** Text außerhalb `{…}` ist literal; im Loch steht ein
Ausdruck. Der häufige Fall braucht damit keine Funktion:
```
{fixed(#,1)} °C  ·  außen {fixed(#{aussen.temp},0)}°   →   21.4 °C  ·  außen 8°
```

**Wertreferenzen:** `#` = gebundener Wert des Elements · `#{schluessel}` = anderer Datenpunkt.
Auf Datenpunkt-Ebene (Default) nur `#` erlaubt (kein Element-Kontext).

**Erlaubt im Loch:** Zahlen, Strings, Wertreferenzen; Klammern; Arithmetik `+ - * / %`
(numerisch, Punkt-vor-Strich); Vergleiche `== != < <= > >=`; Logik `&& || !`;
Bedingung `bedingung ? dann : sonst`.

**Funktionen (feste Whitelist, keine Erweiterung im Anzeigepfad):**
`round(x[,n])` · `fixed(x,n)` · `floor` · `ceil` · `abs` · `min(…)` · `max(…)` ·
`clamp(x,lo,hi)` · `concat(…)` (Textkleben — nicht `+`) · `upper` · `lower` · `pad(s,n)` ·
`map(x, k1,v1, k2,v2, …, default)` (Enum-artig).

Alles darüber hinaus (Schleifen, Zustand, Zeit, komplexe Rechnung) gehört in einen **Baustein**
(ADR-0008), der einen abgeleiteten Datenpunkt schreibt — sichtbar und testbar statt in der
Anzeige versteckt.

**Formale Grammatik (Parser-Intern, nicht Nutzer-Doku):**
```
expr    := ternary
ternary := or ( "?" expr ":" expr )?
or      := and ( "||" and )*
and     := cmp ( "&&" cmp )*
cmp     := add ( ("=="|"!="|"<"|"<="|">"|">=") add )?
add     := mul ( ("+"|"-") mul )*
mul     := unary ( ("*"|"/"|"%") unary )*
unary   := ("-"|"!")? primary
primary := zahl | string | wertref | funktion | "(" expr ")"
wertref := "#" | "#{" schluessel "}"
funktion:= ident "(" (expr ("," expr)*)? ")"
```
