# AUFTRAG P5-7: Visu-Renderer + PWA-Client (read-only)

- **Spur:** 2 (Auftrags-Agent)
- **Branch:** `auftrag/p5-7-visu-renderer`
- **Abgabe:** Pull Request gegen `main`; Merge macht der Maintainer.
- **Regeln:** `AGENTS.md` ist bindend — VOR Arbeitsbeginn vollständig lesen,
  insbesondere § 3 (Branch von origin/main, eigenes Worktree, kein
  `git add .`) und § 4 (Gates sind BLOCKIEREND).

## Kontext

P5-6 (dein eigenes Visu-Format) ist gemergt. Jetzt wird es sichtbar: Der
Visu-Client rendert die Seiten im Browser — Panel- und Handy-tauglich.
Read-only: Bedienen (set-Rolle) kommt erst mit dem Schreibpfad P5-8;
Bedienelemente erscheinen bis dahin sichtbar deaktiviert.

Die Kern-Seite existiert schon als Gerüst: `ui/src/visu.html` +
`ui/src/visu/main.tsx` (Platzhalter, Preact). Der Kern-Prozess liefert:

- `GET /api/visu` → `{ seiten: Record<key, VisuSeite>, designs: VisuDesigns }`
  (Typen aus `@fachwerk/schema`; Endpunkt existiert, Test in
  `core/src/api/handler.test.ts` zeigt die Form)
- `GET /api/datenpunkte` → aktuelle Werte (Form: `ui/src/lib/api.ts`)
- WebSocket `/api/ws` → `{art:"wert", schluessel, wert, ts}` live
  (fertiger Client: `verbindeLive` in `ui/src/lib/api.ts`)

## Pflichtlektüre

1. `AGENTS.md`
2. `adr/0010-layout-responsivitaet.md` — L-2 Canvas/Pinned, L-4 Vererbung
3. `adr/0011-format-kaskade.md` + deine eigenen Module
   `core/src/visu/format.ts` und `core/src/visu/ausdruck.ts`
4. `specs/SPEC-003-visu-elemente.md` — Presets (Tabelle A), R-8/R-9
5. `adr/0013-ui-stack.md` — Preact, plain CSS, zwei Einstiege
6. Als Muster: `ui/src/admin/` (API-Nutzung, CSS-Tokens aus
   `ui/src/lib/stil.css`), `ui/vite.config.ts`, `examples/minimal/visu/`

## Dateibesitz (NUR diese Pfade ändern/anlegen)

- `ui/src/visu/**` (dein Bereich: main.tsx, Renderer-Module, visu.css, …)
- `ui/src/visu.html` (Titel, PWA-Meta)
- `ui/public/**` (neu, falls für PWA-Manifest/Icons nötig)
- `ui/vite.config.ts` — NUR falls nötig, eng umrissen: ein Alias-/
  `server.fs.allow`-Eintrag, damit die puren Kern-Module (unten) importierbar
  sind, und ggf. `publicDir`. Nichts anderes umbauen.
- `examples/minimal/visu/` — Beispiel erweitern, wenn du mehr Presets zeigen
  willst

**Tabu:** `ui/src/admin/**`, `ui/src/lib/**` (Erweiterungen an `api.ts` als
Integrationswunsch in den PR schreiben), `core/`, `cli/`, `Dockerfile`,
`.github/`, `_ingest/`, `research/`.

## Wiederverwendung statt Duplikat (wichtig)

Format-Kaskade und Ausdrucks-Engine werden NICHT in der UI nachgebaut.
`core/src/visu/format.ts` und `core/src/visu/ausdruck.ts` sind pure Module
(keine node:-Imports) — importiere sie direkt (relativer Import oder
Vite-Alias auf `../core/src/visu/`). Lookup-Funktion für `#{schluessel}`
speist sich aus dem lokalen Werte-Store des Clients.

## Lieferumfang

1. **Seiten-Navigation:** Start = erste Seite vom Typ `seite` (alphabetisch)
   oder `?seite=<key>`; Navigation-Preset wechselt Seiten, `popup` öffnet als
   Overlay (Klick außerhalb/X schließt; `include` v1: nicht gerendert,
   Konsolen-Hinweis).
2. **Breakpoint-Wahl (L-2/L-4):** Aus `groessen` den Breakpoint wählen, dessen
   Breite am besten zum Viewport passt (größter, der hineinpasst; Fallback
   `basis`). Elemente ohne eigenes Placement erben die Basis-Geometrie;
   `sichtbar:false` blendet aus. Seite skaliert als Ganzes (transform:
   scale), damit Pixel-Layouts auf abweichenden Displays passen.
3. **Element-Rendering:** Presets Taster/Schalter/Statusanzeige/Wertanzeige/
   Label/Symbol/Navigation + Widget Slider (Anzeige des Werts; Ziehen
   deaktiviert). Rollen: `display` zeigt den formatierten Wert über die VOLLE
   Kaskade — Ebene 1 liefert die API (`/api/datenpunkte` → Feld `format` je
   Datenpunkt), Ebene 2/3 stehen am Element/Placement, Auflösung via
   `effektivesFormat` + `formatiereWert` aus core —, `status` steuert
   `design_je_wert` (R-9). Designs aus designs.yaml als CSS (hintergrund,
   text, rand, schriftgroesse, deckkraft).
4. **Live:** `verbindeLive` aus `ui/src/lib/api.ts`; Werte-Store
   `Map<schluessel, wert>`; Elemente aktualisieren ohne Reload.
5. **PWA:** Manifest (Name „Fachwerk Visu", Icons darfst du als einfache
   SVG-Kachel erzeugen), `display: standalone`; „Verbindung verloren"-Overlay,
   wenn der WS getrennt ist (Reconnect zeigt es automatisch weg). Kein
   Service-Worker-Caching in v1 (bewusst: keine stale UIs beim Entwickeln).
6. **Bedienen deaktiviert:** Elemente mit `set`-Rolle bekommen sichtbaren
   Deaktiviert-Zustand + Tooltip „Bedienen kommt mit P5-8".

## Abnahme

1. Alle Gates (`pnpm typecheck && pnpm lint && pnpm test && bash
   tools/check-repo.sh`) grün — lokal ausgeführt, BEVOR du committest.
2. `pnpm --filter @fachwerk/ui build` grün; Bundle des Visu-Einstiegs bleibt
   schlank (kein neues Paket, keine neuen Dependencies).
3. `pnpm --filter @fachwerk/ui dev` + `fachwerk run examples/minimal` (oder
   Compose): `http://localhost:5173/visu.html` rendert die Wohnzimmer-Seite;
   Wertänderung erscheint ohne Reload; Handy-Viewport (375px) nutzt den
   passenden Breakpoint bzw. skaliert.
4. Format-Kaskade nachweislich aus core importiert (kein dupliziertes
   Formatierungs-Code-Stück in ui/).
5. Commits nach AGENTS.md § 5 (`P5-7:` …); PR-Beschreibung mit
   Detailentscheidungen, bekannten Lücken und Integrationswünschen
   (z. B. api.ts-Erweiterungen, e2e-Skript, CI).
