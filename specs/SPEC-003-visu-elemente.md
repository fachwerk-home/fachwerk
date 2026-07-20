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

## Seitenmodell — Festlegung (konkretisiert R-11, Stand 2026-07-20)

R-11 fordert Popup- und Include-Seiten. Hier steht, wie sie sich verhalten.

### Seitentypen

Jede Seite trägt `typ`:

| `typ` | Bedeutung |
|---|---|
| `seite` | normale Seite (Default) |
| `popup` | wird über einer Seite geöffnet, schließt zurück zur Aufruferseite |
| `include` | eigenständig nicht aufrufbar; wird in andere Seiten eingebettet |

### Inkludieren ist explizit

Eine Seite nennt ihre Includes selbst:

```yaml
typ: seite
name: Startseite
inkludiert: [header, footer]
elemente: { ... }
```

**Bewusst kein globaler Automatismus.** Die Alternative — eine Visu-weite Liste plus
Opt-out je Seite — wurde verworfen: Sie macht das Verhalten einer Seite von einer Datei
abhängig, die man beim Lesen der Seite nicht sieht (Verstoß gegen R-5, Text ist die
Wahrheit) und erzeugt genau die Konfigurationstiefe, die R-7 zähmen soll. Der Nutzen, den
ein globaler Header stiftet, bleibt erhalten: **der Inhalt** steht einmal in
`visu/seiten/header.yaml`, gepflegt an einer Stelle. Nur die Zuordnung ist sichtbar.

### Verschachtelung

Ein Include darf selbst `inkludiert` verwenden (Header, der eine Sidebar einbettet).

- **Zyklen sind ein Fehler**, kein Laufzeitverhalten — geprüft beim Laden, wie beim
  Logik-Graph (ADR-0005 E-6). `a → b → a` lehnt `validate` ab.
- Maximale Tiefe 8. Wer sie erreicht, hat einen Denkfehler, keinen Anwendungsfall.
- Ein Include wird je Seite **einmal** eingebettet, auch wenn es über mehrere Pfade
  erreichbar ist (Diamant-Fall) — sonst lägen Elemente doppelt übereinander.

### Zusammenführung

Includes werden beim Laden in die einbettende Seite **hineingerechnet**; der Renderer
sieht am Ende eine flache Elementliste. Damit ändert sich für Bedienung, Bindungen und
Aktionen nichts — ein Element im Header verhält sich wie jedes andere.

- **Schlüssel** werden mit dem Include-Namen qualifiziert: `header/btn_main`. Gleiche
  Konvention wie Knoten im Logik-Graph (`seite/knoten`), damit Namensgleichheit zwischen
  Seite und Include nie kollidiert.
- **Koordinaten** bleiben unverändert: Ein Include ist eine Schicht im selben
  Koordinatensystem, kein verschobener Container. Der Header liegt oben, weil seine
  Elemente oben liegen.
- **Ebene (Z-Index)** entscheidet global nach dem Zusammenführen. Ein Include liegt nicht
  pauschal vorn oder hinten; es gilt, was an den Elementen steht.
- **Popups** werden nicht hineingerechnet: Sie sind eigene Seiten, die zur Laufzeit über
  der aufrufenden Seite liegen.

### Aktion `umschalten` mit Wert

`{art: umschalten}` kippt zwischen 0 und 1. Für Leuchten wird aber häufig zwischen 0 und
einem **Wunschwert** gekippt (Dimmwert 20 statt 100 %), wobei der aktuelle Zustand aus
einer anderen Adresse kommt als das Ziel:

```yaml
aktionen:
  tippen: { art: umschalten, wert: 20 }
bindungen:
  set:    eg.licht_erker_weiss     # hierhin wird geschrieben
  status: eg.licht_erker_gruen     # hieraus kommt der Zustand
```

`wert` ist optional (fehlt = 1), die getrennte Zustandsquelle steckt bereits in den
Bindungsrollen aus R-8. Beides additiv und rückwärtskompatibel.

## Offene Fragen

- F-2/F-3/F-4 sind durch R-8 (Bindungsrollen), R-9 (dynamische Darstellung), R-11 (Gruppen/
  Z-Index/Seitentypen) und den F-1-Katalog adressiert; Detail-Schemata folgen mit Phase 3.
- F-5: **geschlossen** — Migrations-Mapping steht unten (Import Stufe 3, P5-9).

## Migrations-Mapping des Referenzsystems (F-5, Stand 2026-07-20)

Ermittelt an den Nutzdaten des Betreibers (149 Elemente, 10 Seiten) und gegen
Editor-Screenshots verifiziert. **Clean Room:** hier steht ausschliesslich, wie sich das
Quellsystem beobachtbar verhaelt — kein uebernommener Code, keine Grafiken, keine Schriften.

### Kommunikationsobjekt-Rollen

Die drei KO-Felder eines Quell-Elements haben feste Rollen:

| Quelle | Rolle | Ziel |
|---|---|---|
| KO1 | Steuerung/Anzeige — der dargestellte Wert | `bindungen.display` bzw. `status` |
| KO2 | Wert setzen | `bindungen.set` |
| KO3 | Steuerung des **dynamischen Designs** | `bindungen.status` (nur Darstellung) |
| Befehlsliste | **die tatsaechlichen Aktionen** | `aktionen` |

**Fallstrick, teuer:** KO3 ist NICHT das Schaltziel. Es steuert nur das wertabhaengige
Design. Wer daraus das Schaltziel ableitet, erzeugt eine Visu, in der Knoepfe die falsche
Gruppenadresse schalten — in den Referenzdaten stimmten KO3 und Befehlsziel in 1 von 27
Faellen zufaellig ueberein. Das Schaltziel steht immer in der Befehlsliste.

### Befehle

| Quelle | Bedeutung | Ziel |
|---|---|---|
| cmd 2 | Wert setzen | `{ setze: <wert> }` |
| cmd 4 | zwischen 0 und Wert wechseln | `{ art: umschalten, wert: <wert> }` |
| cmd 6 | wie cmd 4, Zustand aus separater Status-Adresse | `{ art: umschalten, wert: <wert> }` + `bindungen.status` |

Ein Element kann **mehrere** Befehle tragen (Rollladen-auf schreibt auf zwei Adressen);
`aktionen` ist entsprechend eine Sammlung.

### Elementtypen

| Quelle | Anteil | Ziel |
|---|---|---|
| Universalelement | 120 | Preset nach Rolle: `navigation` (Seitenziel gesetzt) · `taster`/`schalter` (Befehl vorhanden) · `wertanzeige` (KO1 + Format im Text) · `symbol` (Text ist Icon-Codepoint) · sonst `label` |
| Gruppe | 21 | `gruppen` |
| Schiebeschalter (eigenes Element) | 5 | `schalter` mit Design — der Schiebe-Effekt ist Gestaltung, kein eigener Typ |
| Dimmer/RGB/HSV | 1 | `widget: dimmer` |
| Farbauswahl | 1 | `widget: farbwahl` (Modi HSV/RGB/Dimmwert) |
| Diagramm | 1 | `widget: diagramm` auf ein Archiv (SPEC-004) |

### Text, Format und Icons

- Der Text eines Elements traegt dreierlei: Klartext, Wertausdruck (`{#} °C`,
  `{floor(#*100/255)} %`) oder einen **Icon-Codepoint** (`&#xeab9`).
- Ausdruecke gehen in `format` (ADR-0011, Anhang A).
- **Icons werden auf einen frei lizenzierten Satz abgebildet.** Die Quell-Schriften sind
  Fremdeigentum und duerfen nicht mitgeliefert werden; ein Betreiber darf seine eigene
  Schrift lokal weiterverwenden. Der Import notiert Original-Codepoint und Schriftnamen am
  Element, damit die Zuordnung nachvollziehbar und umkehrbar bleibt.

### Designs

Das Quellsystem verlangt, jede Farbe und jede Vorlage einzeln anzulegen — Vordergrund,
Hintergrund und Elementfarbe teils dreifach. Der Import fuehrt das zu **benannten Designs**
in `visu/designs.yaml` zusammen; wertabhaengige Vorlagen werden zu `design_je_wert` (R-9).
Der Import ist damit ausdruecklich **keine 1:1-Portierung**, sondern nutzt die Gelegenheit
zur Vereinfachung.

### Nicht Abgebildetes

Jede nicht uebernommene Eigenschaft wird **gezaehlt und benannt** (Stub-Philosophie):
Struktur vollstaendig, Luecken ehrlich. Der Report ist Teil des Importlaufs, nicht eine
Fussnote danach.

## Nächster Schritt

Elementtyp-Zielkatalog v1 steht (F-1). Detail-Schemata (Basiselement-Felder je Rolle,
Widget-Parameter) entstehen mit Phase 3 am laufenden Code.

Seitenmodell und Migrations-Mapping sind festgelegt (R-11 konkretisiert, F-5 geschlossen).
Daraus folgen zwei **additive** Schema-Änderungen, die mit P5-9 umgesetzt werden:

1. Seite bekommt `typ` (`seite`/`popup`/`include`) und `inkludiert: [<seite>, …]`.
2. Aktion `umschalten` bekommt das optionale Feld `wert`.

Beides ist rückwärtskompatibel: bestehende Gewerke ohne diese Felder verhalten sich
unverändert.

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
