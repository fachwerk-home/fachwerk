# ADR-0011: Format-Kaskade (Wertdarstellung von Datenpunkten)

- **Status:** Akzeptiert (2026-07-13)
- **Datum:** 2026-07-13
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)

## Kontext

Wie wird ein Datenpunkt-Wert dargestellt — Einheit, Nachkommastellen, Skalierung/
Umrechnung, evtl. abgeleiteter Text? Zwei bekannte Muster:

- **Ausdrucks-/„Mini-Sprache" am Element** (verbreitet in klassischen Visus): pro Element
  eine Formel wie „Wert × 3,6, eine Nachkommastelle, Einheit km/h". Maximal flexibel, aber
  genau die „für alles ein Template"-Falle, die die Community an HA-Templates kritisiert
  (SPEC-003 R-10, ANFORDERUNGEN-COMMUNITY). Format wird an **jedem** Element neu getippt.
- **Feld-/Measure-Format (Power BI):** Das Format wird **einmal am Feld/Measure** gesetzt
  und **überall** gleich angezeigt. DRY und konsistent, aber ohne Pro-Ansicht-Abweichung.

Beobachtung, die die Entscheidung trägt: Ein Großteil der typischen Element-Ausdrücke ist
gar keine *Präsentation*, sondern **Einheiten-/Skalen-Umrechnung** — z. B. roh 0–255 → 0–100 %
oder m/s → km/h. Das ist eine Eigenschaft des **Datenpunkts**, nicht des einzelnen Elements,
und gehört genau einmal definiert.

Gegenkraft (dein berechtigter Einwand): Manchmal braucht man **pro Ansicht** unterschiedliche
Darstellung — auf dem Tablet die Temperatur mit Nachkommastelle (Platz da), auf dem
Smartphone ganzzahlig.

## Optionen

- **Nur Ausdruck am Element:** flexibel, aber redundant und agenten-/wartungsfeindlich;
  einfache Fälle brauchen unnötig Code.
- **Nur Datenpunkt-Format:** konsistent und DRY, aber keine Pro-Ansicht-Abweichung.
- **Kaskade Datenpunkt → Element → Platzierung, Ausdruck als Fluchtweg (gewählt):**
  vereint „einmal setzen, überall gleich" mit gezielter Abweichung, ohne Code im Normalfall.

## Entscheidung

### FMT-1: Format kaskadiert — Datenpunkt → Element → Platzierung
Die effektive Darstellung eines Werts entsteht aus drei Ebenen; die spezifischere gewinnt:

1. **Datenpunkt-Default (Heimat des Formats).** Am Datenpunkt (SPEC-001) definiert:
   Einheit, Nachkommastellen, Skalierung/Umrechnung (roh → Anzeige), ggf. Wertelisten
   (Enum→Text). Jedes Element, das den Datenpunkt anzeigt, zeigt ihn **ohne Zutun** korrekt.
   Das killt den Großteil der bisherigen Element-Ausdrücke.
2. **Element-Override (optional).** Ein Element darf einzelne Format-Aspekte überschreiben.
3. **Platzierungs-Override (optional, ADR-0010 L-1).** Eine Platzierung (Breakpoint) darf
   einzelne Aspekte überschreiben — z. B. Tablet 1 Nachkommastelle, Smartphone 0. Das ist
   ein **Feld**, keine Sprache.

Nicht überschriebene Aspekte fallen auf die nächsthöhere Ebene zurück. Format ist damit
default-DRY (Power-BI-Konsistenz) und dort abweichbar, wo es nötig ist.

### FMT-2: Einfacher Fall = Felder, kein Ausdruck
Die häufigen Formatgrößen sind **deklarative Felder**, nie eine Formel:
`einheit` · `dezimalstellen` · `skalierung`/`offset` (bzw. Roh→Anzeige-Bereich) ·
`tausendertrenner` · `enum-map` (Wert→Text) · `bool-map` (true/false→Text/Icon).
Der Normalfall einer Wertanzeige braucht **null Code** (Gegenmodell zu HA-Templates, R-10).

### FMT-3: Ausdruck nur als Fluchtweg, klein und dokumentiert
Für echte **Komposition**, die Felder nicht abdecken — Textverkettung mehrerer Datenpunkte,
bedingter Text, mehrstufige Rechnung — gibt es eine **kleine, dokumentierte** Ausdrucks-
Teilmenge (Wert-Platzhalter + Grundarithmetik + wenige Funktionen + Verkettung). Bewusst
**keine** Turing-vollständige Sprache im Anzeigepfad; alles Darüberhinausgehende gehört in
einen Baustein (ADR-0008) und schreibt einen abgeleiteten Datenpunkt.

### FMT-4: Trennung Semantik ↔ Darstellung
Der **Roh-/Semantikwert** des Datenpunkts bleibt unangetastet (Logik, Archive, Bus rechnen
mit ihm). Format wirkt **nur** auf die Anzeige. Skalierung/Umrechnung fürs Auge verändert
nie den gespeicherten oder auf den Bus geschriebenen Wert.

## Konsequenzen

- **Beste beider Welten:** „einmal am Datenpunkt setzen, überall konsistent" (Power BI) **und**
  gezielte Pro-Ansicht-Abweichung (dein Tablet/Smartphone-Fall) — ohne Code im Normalfall.
- **Community-Klage bedient (R-10):** einfache Anzeige = Felder, Ausdruck bleibt die
  begründete Ausnahme.
- **Wartungsarm & agenten-freundlich:** Einheit/Skala eines Sensors ändert man an **einer**
  Stelle; ein Agent muss Format nicht an jedem Element replizieren.
- **Berührt:** SPEC-001 (Datenpunkt bekommt Format-Metadaten als seine Heimat),
  SPEC-003 R-10 (Kaskade + Feldliste konkretisiert), ADR-0010 (Platzierungs-Override ist
  Teil der Platzierung).
- **Kosten/Risiken:** Kaskaden-Auflösung + kontextsensitive UI („dieser Wert wird als … über
  den Datenpunkt-Default angezeigt; hier abweichen?") sauber bauen. Ausdruck-Teilmenge eng
  halten, damit sie nicht zur zweiten Programmiersprache wächst.
- **Geklärt (2026-07-13):** Feldliste je Datentyp (Zahl/Bool/Enum/String/Zeit) → SPEC-001;
  Ausdruck-Teilmenge (Template-Text mit `{…}`-Löchern, `concat()` fürs Textkleben, feste
  Funktions-Whitelist, pur/total, kein `now()`/`eval`) inkl. formaler Grammatik → SPEC-003
  Anhang A. Abgrenzung Format-`dezimalstellen` (Anzeige) vs. Filter-`decimals` (Wert)
  ebenfalls in SPEC-001 festgehalten.
