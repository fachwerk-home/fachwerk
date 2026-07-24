# AUFTRAG B9-SVG-ICONS: Fachwerks eigener Symbolsatz (Codex)

- **Spur:** 2 (Codex) · **Branch:** `auftrag/b9-svg-icons`
- **Start NACH** Merge von VISU-SCHRIFTEN und VISU-SKALIERUNG (gleiche
  Dateien). Regeln: `AGENTS.md`. **Dateibesitz:** `ui/**`,
  `schema/src/visu.ts` + `schema/schemas/visu-seite.schema.json` (NUR das
  neue Feld, siehe unten), `docs/`-Abschnitt.

## Kontext (ADR-0015 D-5, Backlog B-9)

Icon-Schriften sind der Legacy-Weg für importierte Anlagen. NEUE Gewerke
bekommen einen frei lizenzierten, eingebauten SVG-Satz — mehrfarbenfähig,
barrierefrei, ohne 800-kB-Fonts. Der Satz gehört zum PROJEKT (wird mit
ausgeliefert), im Gegensatz zu Betreiber-Beilagen (D-4).

## Umfang

1. **Satz:** ~40 Gebäude-Symbole als Inline-SVG-Modul in `ui/`
   (selbst gezeichnet auf 24x24-Raster ODER aus einem MIT/CC0-Satz wie
   Lucide/Tabler übernommen — dann Lizenzdatei + Quellenangabe im Commit,
   AGENTS § 1.3). Pflichtmotive: Licht (an/aus/dimmen), Steckdose, Rollo/
   Jalousie (auf/ab/stopp/position), Fenster/Tür (offen/zu/gekippt), Heizung/
   Thermostat, Temperatur, Luftfeuchte, Wind, Regen, Sonne/Mond/Wolken,
   Anwesenheit, Alarm/Glocke, Schloss (protected!), Lüfter, Szene, Timer/Uhr,
   Diagramm, Pfeile, Haus/Etage/Raum, Einstellungen.
2. **Schema:** Element-Feld `symbol: <name>` (Preset `symbol` nutzt es;
   erlaubt auf allen Presets als Beigabe links vom Text). Namen =
   geschlossene Liste im Schema (Enum aus dem Satz) — der Editor kann sie
   anbieten, Tippfehler fallen in validate auf.
3. **Renderer:** `symbol` rendert das SVG in Textfarbe des Designs
   (currentColor); Größe folgt der Element-Schriftgröße; mit
   `design_je_wert` wechselbar (z. B. Rollo-Position).
4. **Editor:** Symbol-Picker im Eigenschaften-Panel (Raster mit Suche).
5. **Doku:** Galerie-Abschnitt (Name → Bild) in docs/, damit Agenten die
   Namen kennen (Agent-first: die Enum-Liste ist maschinenlesbar im Schema).

## Abnahme

1. Alle 4 Gates + UI-Build lokal grün; Bundle-Zuwachs < 30 kB gzip (SVGs
   sind Pfade, keine Rasterbilder).
2. Schema-Feld validiert (unbekannter Name ⇒ validate-Fehler mit Ort).
3. Handprobe im PR (Screenshots dark+light): Beispielseite mit 6 Symbolen,
   eines per design_je_wert wechselnd.
4. Lizenz sauber: eigene Zeichnungen ODER MIT/CC0 mit Datei + Quellenangabe.
5. Commits `B9:`; PR mit Motivliste und offenen Wünschen.
