# AUFTRAG VISU-SKALIERUNG: Seite auf den Viewport skalieren (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/visu-skalierung`, zwingend von `origin/main`.
- **Herkunft:** Nachbesserung B3. Die Analyse ergab, dass der Befund „Texte zu
  groß" NICHT am Importer liegt — die Werte stimmen. Es fehlt die Skalierung.
- **Pflichtlektüre:** `AGENTS.md`, `schema/src/visu.ts` (`VisuSeite.groessen`).

## Der Befund (gemessen, nicht vermutet)

Das Altsystem entwirft eine Visu auf **einer festen Breite** und überlässt dem
Gerät die Verkleinerung — im gesicherten Live-Rendering der Betreiber-Visu:

```
<meta name="viewport" content="user-scalable=no, width=1170">
```

Auf einem iPhone 14 (390 CSS-px) ergibt das Faktor **1/3**: eine im Gewerk
hinterlegte Schriftgröße von 100 px erscheint dort als ~33 px.

Fachwerk rendert die Seite bisher 1:1 in den Viewport. Deshalb wirkt alles um
den Faktor der Verkleinerung zu groß — Schrift, Abstände, Elementgrößen
gleichermaßen. Die Werte im Gewerk sind korrekt und dürfen NICHT angefasst
werden; es fehlt allein die Abbildung Seite → Viewport.

Der Importer setzt inzwischen für alle Seiten einer Visu **dieselbe Breite**
(`groessen.<breakpoint>.w`), damit der Faktor über alle Seiten gleich ist. Die
Höhe bleibt seitenweise, weil Seiten vertikal scrollen.

## Umfang

1. **Skalierung im Visu-Client** (`ui/src/visu/`): Die Seitenfläche wird so
   skaliert, dass die Breite `groessen.<basis>.w` genau den verfügbaren
   Viewport füllt. Faktor = `viewportBreite / seitenBreite`. Vertikal wird
   NICHT eigenständig skaliert (sonst verzerrt es) — die Seite wird länger und
   scrollt, wie im Original.
2. **Als reine Funktion** mit Test (Faktor bei breiterem/schmalerem Viewport,
   Seite ohne Breite, Faktor > 1 = Hochskalieren auf großen Schirmen — dabei
   eine sinnvolle Obergrenze überlegen und begründen).
3. **Umsetzung:** CSS-`transform: scale()` auf der Seitenfläche plus
   Höhenkorrektur des Containers (skalierte Höhe = h × Faktor), damit das
   Scrollen stimmt. `transform-origin: top left`.
4. **Bedienbarkeit prüfen:** Klickflächen müssen nach der Skalierung an der
   richtigen Stelle liegen (Browser rechnet das bei `transform` mit — im PR
   kurz bestätigen, dass Taster/Schalter treffen).
5. **Editor-Canvas:** unverändert lassen (dort ist 1:1 plus eigener Zoom
   sinnvoll). Nur der Visu-Client skaliert.

## Nicht-Scope

- Keine Änderung an Werten im Gewerk (Schriftgrößen, Positionen) — die sind
  gemessen korrekt.
- Keine Änderungen an `core/**`, `schema/**`, `importer/**`.
- Breakpoint-Auswahl (`waehleBreakpoint`) bleibt wie sie ist.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Faktor-Funktion mit Tests.
- Handprobe im PR: eine importierte Seite (Breite 1170) in einem schmalen
  Fenster — Inhalt füllt die Breite, Schrift wirkt normal groß, Bedienelemente
  treffen. Bei sehr breitem Fenster kein absurd großes Rendering.
