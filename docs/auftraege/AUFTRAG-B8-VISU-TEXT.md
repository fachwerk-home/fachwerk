# AUFTRAG B8-VISU-TEXT: Statischer Text auf Visu-Elementen — Codex

- **Spur:** 2 (Codex) · **Branch:** `auftrag/b8-visu-text`
- **Abgabe:** PR gegen `main`. Regeln: `AGENTS.md` (Branch von origin/main,
  eigenes Worktree, Gates BLOCKIEREND, kein `git add .`).
- **Dateibesitz:** `ui/**`. Tabu: alles andere.

## Kontext (B-8 im Backlog)

Der Visu-Import (P5-9-v2) füllt jetzt das Schema-Feld `text` am Element
(`VisuElement.text`, optional — siehe `schema/src/visu.ts` auf aktuellem
main). Beschriftungen aus dem Altsystem kommen also an — aber Renderer und
Editor ignorieren das Feld noch: Elemente zeigen den technischen Schlüssel
(`lesbarerName(key)`) statt des gepflegten Textes. Genau deshalb sehen
importierte Seiten „platzhalterig" aus.

## Umfang

1. **Renderer (`ui/src/visu/`):** Anzeige-Priorität überall einheitlich:
   `element.text` (falls gesetzt und nicht leer) → sonst bisheriges
   Verhalten (formatierter Wert bzw. `lesbarerName(key)`). Gilt für alle
   Presets (label, taster, schalter, statusanzeige, navigation, symbol)
   und Widgets. Bei wert-anzeigenden Elementen ist `text` das ETIKETT
   neben/über dem Wert, nicht der Ersatz des Werts — Layout: Etikett klein,
   Wert prominent (bestehende Kachel-Struktur nutzen).
2. **Editor (`ui/src/admin/visu-editor.tsx`):** Textfeld „Text" im
   Eigenschaften-Panel (gehört zu den ~5 Sofort-Feldern, R-7); leerer
   String löscht das Feld (kanonisch: kein `text:`-Eintrag im YAML).
   `visu-yaml.ts`: `text` in der Feld-Reihenfolge an der Stelle, die das
   Schema/`KEY_ORDER`-Muster vorgibt (an core/canonical orientieren, damit
   Roundtrips diff-frei bleiben — Roundtrip-Test erweitern!).
3. **Editor-Canvas** zeigt den Text live wie der Renderer (gleiche
   Prioritäts-Helferfunktion — EINE Funktion in `ui/src/visu/modell.ts`,
   von Renderer UND Editor benutzt, mit Vitest-Test).
4. **NICHT in diesem Auftrag:** Icon-/Symbol-Schriften (Glyphen wie ``
   erscheinen weiter als Ersatzzeichen — das ist der separat geplante
   Folgeschritt mit Lizenzklärung; im PR nur als bekannte Grenze erwähnen).

## Abnahme

1. Alle 4 Gates + `pnpm --filter @fachwerk/ui build` lokal grün.
2. Prioritäts-Helfer als reine Funktion mit Tests (text gesetzt/leer/
   fehlend × mit/ohne display-Bindung).
3. Roundtrip-Test: Seite mit `text`-Feld laden → speichern → diff-frei.
4. Handprobe im PR (Screenshot): examples/minimal-Seite, ein Element mit
   gesetztem `text` — Canvas, Renderer und gespeichertes YAML stimmen
   überein; Editor-Feld leeren entfernt den Eintrag aus dem YAML.
5. Keine neuen Dependencies. Commits `B8:` nach AGENTS.md § 5.
