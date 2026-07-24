# ADR-0015: Binärdateien im Gewerk (Schriften, Bilder)

- **Status:** AKZEPTIERT (Betreiber, 2026-07-24) — D-1 bis D-4 umgesetzt
  (Verzeichnis, Namensbezug, Auslieferung, Hygiene-Regel). D-5 ist als
  Backlog B-9 terminiert, nicht implementiert. Die Renderer-Hälfte
  (`@font-face` + Schriftfamilie) liegt als `AUFTRAG-VISU-SCHRIFTEN.md` bei
  Spur 2 — bis dahin sind die Dateien zwar im Gewerk und abrufbar, aber die
  Symbole erscheinen noch als Ersatzzeichen.
- **Datum:** 2026-07-24
- **Kontext-Auslöser:** Visu-Import (P5-9). Die importierte Visu zeigt leere
  Kästchen statt Symbolen, weil die Symbol-Schrift des Panels nicht Teil des
  Tabellen-Exports ist.

## Kontext

ADR-0004 hat entschieden: **Gewerk = Text.** Logik, Datenpunkte, Visu und
Konfiguration sind lesbare, diffbare, kanonisch serialisierte Dateien. Das ist
eine der tragenden Zusagen des Projekts: ein Gewerk lässt sich versionieren,
im Editor UND von Hand bearbeiten, und ein Diff zeigt fachliche Änderungen
statt Byte-Rauschen.

Eine Visualisierung braucht aber Dinge, die kein Text sind: Symbole,
Hintergrundbilder, Schriften. Beim Referenz-Import trat das konkret zutage —
52 Symbol-Verwendungen auf 13 verschiedenen Zeichen, alle aus zwei
Schriftdateien, die auf dem Altsystem liegen. Ohne sie ist die importierte
Visu benutzbar, aber die Bedienelemente sind unbeschriftet.

Der Betreiber-Export (User-Modul) liefert genau dieses Paket: die
Tabellendaten **und** die Dateien.

## Entscheidung

**D-1 — Ein Gewerk darf Binärdateien enthalten, aber nur an einer Stelle und
nur als Beiwerk.** Verzeichnis: `visu/dateien/`. Alles Steuernde bleibt Text;
Binärdateien sind ausschließlich Darstellungsmittel. Kein Codepfad darf aus
ihnen Verhalten ableiten.

**D-2 — Referenziert wird über den Dateinamen, nie über einen Pfad.** In den
Design-Vorlagen steht `schriftart: "KNX UF"` bzw. ein Bildname; die Auflösung
macht die Laufzeit. Damit bleibt das Gewerk ortsunabhängig und der Diff
lesbar.

**D-3 — Die Laufzeit liefert sie unter einer eigenen Route aus**
(`/api/visu/datei/<name>`), mit denselben Regeln wie jeder andere Lesezugriff:
Scope `read`, kein Pfad-Ausbruch, nur aus `visu/dateien/`.

**D-4 — Fremde Schriften und Bilder gehören dem Betreiber, nie dem Projekt.**
Importierte Dateien landen im Gewerk des Betreibers. Sie kommen **nicht** ins
Fachwerk-Repository und **nicht** in `examples/` — dort stünden sie unter
unserer Verteilung, und ihre Lizenz gehört uns nicht (im Referenzfall etwa ein
kommerzieller Icon-Dienst). Der Hygiene-Check erzwingt das.

**D-5 — Fachwerks eigener Weg für Symbole ist SVG, nicht eine Schrift.**
Icon-Schriften waren die Antwort auf ein Ladezeit-Problem von gestern: eine
837-kB-Datei für zehn benutzte Zeichen, dazu Vorlese-Müll für Screenreader und
keine Mehrfarbigkeit. Für neue Gewerke bekommt Fachwerk einen frei lizenzierten
SVG-Satz (Backlog B-9); der Schriften-Pfad bleibt der **Legacy-Weg** für
importierte Anlagen.

## Begründung

Die Alternative wäre gewesen, Symbole beim Import auf einen eigenen Icon-Satz
abzubilden. Das ist bei 13 Zeichen machbar, aber es ist Handarbeit, es rät bei
jedem weiteren Gewerk neu, und es macht aus einem verlustfreien Import einen
interpretierenden. Die Dateien mitzunehmen ist ehrlicher: was der Betreiber
hatte, hat er weiterhin — und er kann später bewusst auf Fachwerk-Symbole
umstellen, statt es beim Import erzwungen zu bekommen.

Der Preis ist die aufgeweichte „Gewerk = Text"-Zusage. Er wird klein gehalten:
ein einziges Verzeichnis, reines Beiwerk, keine Semantik. Ein Gewerk ohne
`visu/dateien/` bleibt vollständig textuell — der Normalfall für alles, was
nicht aus einer Altanlage kommt.

## Folgen

- Der Importer nimmt das Export-Paket (Tar) statt nur der JSON entgegen und
  legt Schriften/Bilder in `visu/dateien/` ab.
- Das Design-Schema bekommt `schriftart`; der Renderer deklariert `@font-face`
  und wendet die Familie an.
- `tools/check-repo.sh` verbietet Binärdateien unter `examples/`.
- Backup/Umzug eines Gewerks umfasst jetzt auch Binärdateien — für Git
  unkritisch (wenige, kleine, sich nie ändernde Dateien), aber erwähnenswert.
