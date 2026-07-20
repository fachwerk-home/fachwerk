# AUFTRAG P5-9: Visu-Import — Betreiber-Visu übernehmen (Spur 1)

- **Ausführender:** Maintainer (Claude/Opus) — EINZIGE Spur mit
  `_ingest/`-Zugriff. Quelldatei: `_ingest/visu-export/exportVisu.json`
  (Nutzdaten des Betreibers; Clean-Room: Tabellenwerte ja, nie Code).
- **Ziel:** `fachwerk import` Stufe 3 — aus dem Export `visu/`-Dateien
  (P5-6-Format) erzeugen, sodass die LCD-Panel-Visu erkennbar rendert.

## Bekannte Quellstruktur (bereits gesichtet)

JSON = Dump der editVisu*-Tabellen: `editVisu` (Visu-Definitionen, 13),
`editVisuPage` (Seiten: folderid, visuid, pagetyp, xsize/ysize, bgcolorid,
Grid), `editVisuElement` (149: controltyp, visuid, pageid, gaid/gaid2/gaid3
= KO-Rollen!, zindex, xpos/ypos/xsize/ysize, text, var1..var20 =
typabhängige Parameter, gotopageid/closepopupid = Navigation, hascmd),
`editVisuElementDesign`/`...DesignDef` (Design-Slots s1..s48 je styletyp),
`editVisuBGcol`/`FGcol`/`Font` (Paletten), `editVisuCmdList` (Element-
Befehle, gleiche Struktur wie editLogicCmdList — Katalog
`importer/src/befehle-katalog.ts` passt), `editKo` (88 — KO→GA-Zuordnung
für die Rollen).

## Vorgehen

1. **Mapping-Referenz aufbauen:** `controltyp`-Nummern und var-Slots sind
   nicht dokumentiert. Weg: Werte-Verteilung im Export analysieren
   (welche controltyp-Nummern kommen vor, welche vars sind je Typ belegt)
   und mit dem Betreiber abgleichen.
   **WICHTIG — Scope der Rückfragen:** Der Export enthält zwar 13
   editVisu-Einträge, aber real existieren nur ~3 Visus und NUR EINE ist
   produktiv aktiv (das LCD-Panel). Erst beim Betreiber erfragen, WELCHE
   das ist (Name/visuid), dann: Abnahme + Screenshot-Rückfragen NUR für
   deren Seiten; alle übrigen Visus best-effort konvertieren, Lücken
   landen kommentarlos im Report. Keine Screenshot-Listen über alles.
   NICHT raten: unklare Typen → als `label` mit Notiz importieren + Report.
2. **Konverter `importer/src/visu.ts`** (+ Test mit synthetischem Fixture):
   Seiten → `visu/seiten/<slug>.yaml` (Größe aus xsize/ysize als einziger
   Breakpoint `panel`, Basis), Elemente → Basiselement-Presets nach
   F-1-Mapping (gaid→Rollen: gaid=set/display, gaid2/gaid3 nach
   Verhalten → status; über editKo→GA→bestehende Datenpunkt-Schlüssel des
   Stufe-1-Imports auflösen), gotopageid→Navigation, pagetyp→seite/popup,
   zindex→ebene, Designs → `visu/designs.yaml` (nur belegte Slots:
   Hintergrund-/Textfarbe, Schrift — Rest Report), CmdList → Aktionen
   (cmd 1/2 = setze), `{fixed(#,1)}`-artige Textformate → Format-Felder.
3. **Report** (Stub-Philosophie): jede nicht abgebildete Eigenschaft wird
   GEZÄHLT und benannt (controltyp unbekannt, var-Slot ignoriert, …) —
   Struktur rein, Lücken ehrlich.
4. **CLI:** `fachwerk import --visu <exportVisu.json>` als Zusatzschritt
   oder dritter Parameter; schreibt ins bestehende Ziel-Gewerk;
   Selbstprüfung via `ladeVisu` (muss fehlerfrei laden, sonst Exit 1).

## Abnahme

Gates grün · Konverter-Tests mit synthetischem Fixture (KEINE Betreiber-
Daten ins Repo!) · Realer Lauf: Betreiber-Visu lädt via `ladeVisu`
fehlerfrei, Haupt-Seiten im Visu-Client erkennbar (Screenshot an den
Betreiber zur Bestätigung) · Report listet alles Nicht-Abgebildete.
