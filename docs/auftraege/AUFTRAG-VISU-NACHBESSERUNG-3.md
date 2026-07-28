# AUFTRAG VISU-NACHBESSERUNG-3: Fachwerk-Zierrat auf importierten Elementen (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/visu-nachbesserung-3`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md`, `ui/src/visu/main.tsx`, `ui/src/visu/visu.css`.

## Warum

Der Betreiber hat seine importierte Visu auf dem Panel angesehen. Der Import
selbst liefert die Daten korrekt — was stört, malt die Oberfläche darüber. Zwei
Befunde, beide aus seiner Rückmeldung:

> Unter den aktiven Buttons im Header sind Pfeile. […] Die einzelnen
> Hintergrundelemente sind alles Rechtecke mit abgerundeten Ecken, und alle
> haben einen ganz dünnen Rahmen. Das sieht dann etwas seltsam aus.

Die Leitlinie für beides: **eine importierte Visu bringt ihr Aussehen mit.** Wo
das Altsystem Farbe, Rahmen, Radius und Symbol vollständig festlegt, darf
Fachwerk nichts hinzuerfinden. Unser Design-System gilt für Elemente, die
NICHTS mitbringen — dort ist es ein Gewinn, hier ist es Zierrat.

## 1. Der aufgemalte Pfeil

`ui/src/visu/main.tsx:207` hängt an jedes Navigationselement ein `→`:

```tsx
case "navigation":
  return <span>{anzeige.label} <span aria-hidden="true">→</span></span>;
```

Bei einem importierten Element IST das Label bereits das Symbol aus der
Panel-Schrift (ein Glyph wie ``). Der Pfeil steht dann daneben und
verdoppelt die Aussage — im Kopfbereich des Betreibers stehen fünf Symbole mit
je einem Pfeil darunter.

**Erwartet:** Der Pfeil erscheint nur, wenn das Element **keinen eigenen
Bildinhalt** hat, also kein Symbol-Glyph und keine eigene Schriftart mitbringt.
Ein Navigationselement, das nur „Wohnzimmer" heißt, darf den Pfeil weiter
tragen — er ist dort die einzige Andeutung, dass es weiterführt.

## 2. Der Rahmen und die runden Ecken

`ui/src/visu/visu.css:28` gibt jedem `.visu-element` Rahmen, Radius, Schatten
und Polsterung; Zeile 29 nimmt das für `data-kachel="false"` wieder weg.
`main.tsx:246` entscheidet:

```tsx
const ohneStandardKachel = new Set(["label", "taster", "schalter", "navigation", "symbol"]);
const kachel = ohneStandardKachel.has(element.preset ?? "") ? hatDesignKachel : true;
```

Genau hier kippt es: `hatDesignKachel` heißt „bringt sein Aussehen selbst mit" —
und führt trotzdem zur vollen Fachwerk-Kachel. Die Hintergrundflächen des
Betreibers (1170 px breite, randlose Farbflächen) bekommen dadurch einen 1px-
Rahmen und `--fw-radius-l` obendrauf.

**Erwartet:** Bringt ein Element eigene Flächenangaben mit (Hintergrund,
Rahmenbreite, Rahmenfarbe, Radius), wird **genau das** gezeichnet — kein
zusätzlicher Rahmen, kein zusätzlicher Radius, kein Schatten, keine Polsterung.
Fehlt eine dieser Angaben, bleibt sie schlicht ungesetzt; sie wird nicht aus dem
Design-System ergänzt. Elemente ohne eigene Angaben verhalten sich wie bisher.

Das dritte `data-`-Attribut dafür ist in Ordnung, wenn es hilft — aber die
Entscheidung gehört in die reine Funktion, nicht ins JSX.

## Nicht-Scope

- `importer/**`, `core/**`, `cli/**`. Die Verlaufsrichtung war ein echter
  Importfehler und ist bereits behoben (Spur 1) — davon bitte nichts anfassen.
- Die Trennlinien-Höhe: die stimmt (12 px, wie im Altsystem). Sie *wirkte* zu
  hoch, weil der Verlauf quer statt senkrecht lief; mit dem Importfix erledigt.
- Kein neues Design für importierte Visus. Ziel ist Abwesenheit von Zierrat,
  nicht ein zweiter Stil.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Die Kachel-Entscheidung ist eine reine Funktion mit Tests: Element mit
  eigenem Hintergrund → keine Fachwerk-Kachel; Element ohne alles → wie bisher.
- Der Pfeil-Fall ebenso: Navigationselement mit Glyph → kein Pfeil;
  Navigationselement mit reinem Text → Pfeil.
- Handprobe im PR gegen `examples/` — Betreiberdaten gehören nicht ins Repo.
