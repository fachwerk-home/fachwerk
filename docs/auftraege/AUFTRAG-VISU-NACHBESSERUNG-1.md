# AUFTRAG VISU-NACHBESSERUNG-1: Befunde der DEV-Sichtprüfung (24.07.2026)

Quelle: Sichtprüfung des Betreibers am DEV-System (importierte Panel-Visu,
Screenshots liegen dem Betreiber vor). Vier Befunde Renderer/Admin-UI, drei
Befunde Schema/Import. Reihenfolge beachten: Teil B (Spur 1) liefert die
Schema-Felder, Teil A Punkt 2–3 konsumiert sie; A1 und A4 sind sofort machbar.

## Teil A — Codex (ui/**, Branch `auftrag/visu-nachbesserung-ui`)

Regeln: `AGENTS.md` (Branch von origin/main, eigenes Worktree, Gates
BLOCKIEREND, kein `git add .`). Dateibesitz: `ui/**`.

1. **Visu-Client zeigt NIE den technischen Schlüssel.** Befund: Trenner-
   Elemente (label ohne `text`, ohne Bindung) rendern „Trenner header menue" —
   der `lesbarerName(key)`-Fallback gehört NICHT in den Client. Fallback-Kette
   im Visu-Client: `text` → formatierter Wert (falls display/status-Bindung) →
   **leer**. Der Schlüssel-Fallback bleibt ausschließlich im Editor-Canvas
   (dort ist er Orientierung). Helferfunktion entsprechend um einen
   `kontext: "client" | "editor"`-Parameter erweitern + Tests.
2. **Include-Seiten rendern** (nach B2): Seiten vom `typ: include`, die über
   das neue Seiten-Feld referenziert werden, werden VOR dem Seiteninhalt
   gerendert (Z-Ordnung über `ebene` wie gehabt). Damit erscheint der
   importierte Header auf jeder Seite. Include-Seiten tauchen weiterhin nicht
   in der Seiten-Navigation auf.
3. **Label-Optik entkacheln:** Befund: Texte „sehr groß und mit Rand".
   `label`-Preset bekommt KEINEN Standard-Rand/Kachel-Hintergrund — Rand,
   Hintergrund und Schriftgröße kommen ausschließlich aus dem Design
   (designs.yaml bzw. B3-Mapping); ohne Design: nackter Text in Grundschrift.
   Presets mit Interaktion (taster/schalter) behalten ihre Kachel.
4. **Admin → Archive: Listenknöpfe sind unbeschriftet.** Der Name wird
   gerendert (`<strong>{archiv.name}</strong>`), ist aber unsichtbar —
   CSS-Fehler (Textfarbe/Überlauf im Listen-Button, dark mode). Fixen,
   in beiden Themes prüfen.

## Teil B — Spur 1/Opus (schema + importer + core, direkt auf main)

1. **Seitenhintergrund:** Befund: Hintergrundfarbe fehlt/falsch. Schema:
   optionales Feld an der Seite (Vorschlag `hintergrund: <farbe>` oder
   Seiten-`design`-Verweis — Entscheidung dokumentieren). Importer füllt es
   aus `editVisuPage.bgcolorid` über die BGcol-Palette. Feld zuerst mergen,
   dann Codex informieren (A-Teil konsumiert es im selben Zug wie A2).
2. **Include-Verweise:** Schema-Feld an der Seite (Vorschlag
   `includes: [<seiten-key>]`); Importer: `globalinclude=1`-Seiten auf allen
   normalen Seiten eintragen, `includeid`-Verweise je Seite. Der Header liegt
   schon als `typ: include`-Seite vor — es fehlt nur die Referenz.
3. **Schriftgrößen-Mapping prüfen:** Texte wirken deutlich zu groß. Faktenquelle:
   `_ingest/iPhone_Visu_Main.html` (vom Betreiber gesichertes Live-Rendering
   der Haupt-Visu; NUR Spur 1, wie alle _ingest-Daten). Daraus GEOMETRIE- und
   FARB-FAKTEN ziehen (gerenderte Pixelgrößen, Farbwerte des Headers) und das
   Slot→Schriftgröße/Farb-Mapping des Importers kalibrieren. KEIN Markup/CSS
   übernehmen — nur Zahlen/Fakten ablesen (research/-Notiz, Optik-Regel).
4. Trenner tragen korrekt KEIN `text`-Feld — hier nichts ändern; die sichtbare
   Beschriftung war der Client-Fallback (A1).

## Erwartung nach Merge beider Teile

Betreiber zieht den Import neu und redeployt: Header sichtbar, Seitenfarbe
stimmt, Trenner stumm, Labels in richtiger Größe ohne Kastenoptik,
Archiv-Liste beschriftet. Symbole bleiben offen bis Font-Paket (ADR-0015)
plus .tar-Export der Visu — separat verfolgt.
