# AUFTRAG VISU-GRUNDSTIL: Seiten-Voreinstellungen vererben (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/visu-grundstil`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md`, `docs/VISU-TREUE-PLAN.md`,
  `ui/src/visu/main.tsx`, `ui/src/visu/design.ts`, `schema/src/visu.ts`
  (`VisuGrundstil`).
- **Kann sofort beginnen.** Das Schema-Feld steht auf `main`; Spur 1 füllt
  parallel den Importer. Beide Seiten sind unabhängig.

## Warum

Ein gemessener Vergleich der importierten Visu gegen das Original ergab **68
Abweichungen auf einer Seite — davon 46 mit derselben Ursache**:

| Abweichung | Anzahl |
|---|---:|
| Schriftart | 28 |
| Schriftfarbe | 10 |
| Schriftgröße | 8 |

Das Altsystem gibt seinen Seiten Voreinstellungen mit (Schrift, 10 px,
schwarzer Text). Jedes Element ohne eigene Angabe erbt sie. Fachwerk setzt
stattdessen die Vorgaben seiner **eigenen Oberfläche** ein — Inter, 14 px,
helles Grau. Deshalb sehen ausgerechnet die Elemente falsch aus, die im
Original nichts eigenes mitbringen: die schlichten Standard-Schalter.

Das ist kein Fall von „jedes Element einzeln nachbessern". Es ist ein Fehler,
der 46-mal sichtbar wird.

## Das Feld

`VisuSeite.grundstil` (alle Angaben optional):

```ts
interface VisuGrundstil {
  schriftart?: string;      // Name aus visu/dateien/, wie im Design
  schriftgroesse?: number;  // px
  text?: string;            // Schriftfarbe — heisst wie im Design `text`
  textausrichtung?: "links" | "zentriert" | "rechts" | "blocksatz";
}
```

Bewusst nur **vererbbare** Angaben. Was nicht vererbt wird, gehört ins Design.

## Umfang

1. Der `grundstil` der Seite wird auf die Zeichenfläche gelegt, sodass alle
   Elemente ihn per CSS erben. Ein Element mit eigener Angabe im Design
   überschreibt ihn — das ergibt sich aus der Vererbung von selbst und braucht
   keine Sonderbehandlung.
2. **Fehlt `schriftart`, darf NICHT die Schrift der Fachwerk-Oberfläche
   greifen.** Dann gilt eine neutrale Serifenlose. Das ist der Kern des
   Auftrags: eine importierte Seite ist kein Teil unserer Oberfläche und soll
   deren Typografie nicht erben.
3. Eingebundene Seiten (`includes`, z. B. ein Kopfbereich) bringen ihren
   eigenen `grundstil` mit. Der muss für ihre Elemente gelten, nicht der der
   einbindenden Seite.
4. Fehlt `grundstil` ganz, ändert sich **nichts** — Gewerke ohne das Feld
   sehen aus wie bisher.

## Nicht-Scope

- `core/**`, `cli/**`, `schema/**`, `importer/**`. Das Feld steht bereits;
  Spur 1 füllt es.
- Keine Widgets, keine neuen Design-Angaben.
- Der Admin-Bereich braucht das nicht — es geht um die Visu-Anzeige.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktion mit Tests, mindestens: (a) `grundstil` gesetzt → die Angaben
  landen auf der Fläche; (b) `schriftart` fehlt → neutrale Serifenlose, **nicht**
  die Oberflächenschrift; (c) kein `grundstil` → unverändert.
- Handprobe im PR gegen `examples/` — ein Beispiel-Gewerk mit `grundstil`
  genügt; Betreiberdaten gehören nicht ins Repo.
