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

### R-3: Responsive (★★)
Pixelfixe Visus müssen je Endgerät nachgebaut werden. Fachwerk braucht
Responsive-Varianten/Breakpoints oder ein flexibles Layoutmodell, ohne die pixelgenaue
Kontrolle aufzugeben („pixelgenau UND HTML5-flexibel").

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

### R-10: Wertformatierung — einfach im Standardfall, mächtig bei Bedarf
Häufige Fälle (Einheit, Nachkommastellen, Faktor) sind **Felder** (Einheit `°C`, Dezimalen,
Skalierung), kein Ausdruck nötig. Für Fortgeschrittene optional eine kompakte
Ausdruckssyntax (Wert-Platzhalter + Funktionen/Arithmetik). Bewusster Gegenentwurf zur
„für alles ein Template"-Kritik an anderen Systemen.

### R-11: Struktur — Gruppen/Ebenen und Seitentypen
Elemente in **Gruppen** (benannte Layer/Container) organisierbar, mit Ebenenreihenfolge
(Z-Index). Seitentypen: normale Seite, **Popup/Overlay**, und **Include-/Master-Seite**
(gemeinsames Layout, in andere Seiten eingebunden). Navigation (Seite/Popup öffnen/schließen)
direkt an Elementen konfigurierbar.

## Offene Fragen (Zielkatalog ausarbeiten)

- F-1: Zielkatalog der Elementtypen für Fachwerk v1 (Taster, Dimmer, Jalousie, Wert,
  Diagramm, Kamera, iFrame …).
- F-2: Struktur einer Visuseite (Ebenen/Z-Index, Gruppen, Seitenhierarchie).
- F-3: Template/Instanz-Mechanik (Vererbung, Overrides).
- F-4: Bindungsmodell: wie bindet ein Element an einen Datenpunkt, wie werden dynamische
  Eigenschaften (Farbe je Wert etc.) deklariert.
- F-5: Migrations-Mapping bestehender Elementparameter (Import-Assistent Phase 6).

## Nächster Schritt

Visueditor-Elementtypen und Bindungsmodell als Zielkatalog ausarbeiten (F-1…F-5), analog zum
Vorgehen bei KO-Modell/Logikeditor). Danach Elementtypen-Zielkatalog für Fachwerk v1.
