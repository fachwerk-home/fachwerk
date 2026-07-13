# ADR-0010: Layout- & Responsivitätsmodell

- **Status:** Akzeptiert (2026-07-13)
- **Datum:** 2026-07-13
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)

## Kontext

Pixelgenaue Visualisierung ist ein Kern-USP (SPEC-003 R-1), aber pixelfixe Seiten haben
einen strukturellen Nachteil: Jede Zielauflösung (Tablet, Smartphone, Desktop) muss einzeln
gebaut werden (R-3). Gleichzeitig soll der Editor nur eine **Sicht auf die deklarativen
Projektdateien** sein (R-5, ADR-0004): Jede Layout-Aktion ist eine Textänderung, die Mensch
(Maus) und Agent (API/MCP) auf demselben Modell vornehmen.

Zwei etablierte Vorbilder aus Microsofts Power Platform (öffentlich bekannte
Produktkonzepte, keine geschützten Interna):
- **Model-driven Apps:** Layout ergibt sich aus der Anordnung in einem Container-/Raster-
  system und ist damit **von Haus aus responsiv** — wenig Kontrolle, keine Pro-Gerät-Arbeit.
- **Power BI:** Man baut ein Layout (z. B. Tablet), wechselt auf die Smartphone-/Desktop-
  Ansicht und zieht **bereits verwendete Elemente** dort hinein, positioniert/formatiert sie
  neu — das zweite Gerät ist ein **Derivat, kein Nachbau**.

Kräfte: Pixelkontrolle bewahren · „pro Gerät neu bauen" abschaffen · agent- und
diff-freundlich bleiben · nicht zwei unvereinbare Editoren bauen.

## Optionen

- **Nur pixelfix (Status quo des Referenzdenkens):** volle Kontrolle, aber R-3 ungelöst.
- **Nur Auto-Flow (Container/Raster):** responsiv gratis, aber verliert die pixelgenaue
  Kontrolle, die den USP ausmacht.
- **Nur Multi-Canvas (Power-BI-Weg):** Pixelkontrolle je Gerät, zweites Gerät als Derivat —
  aber ohne einen Schnellpfad für „mach es einfach responsiv".
- **Geteiltes Identitätsmodell mit zwei Layout-Modi (gewählt):** beide Vorbilder als Modi
  über *einem* Datenmodell.

## Entscheidung

### L-1: Identität von Platzierung trennen (Fundament)
Ein Visu-Element hat eine **geräteunabhängige Identität**: stabile Schlüssel, Datenpunkt-
Bindungen mit Rollen (SPEC-003 R-8), Verhalten (Klick/Aktion). Layout ist eine **separate**
Facette:

```
element  = { key, typ, bindings{rolle→datenpunkt}, verhalten }      # geräteunabhängig
placement[breakpoint] = { x, y, w, h, sichtbar, format-overrides }  # 0..n je Element
```

Ein Element existiert **einmal** und trägt 0..n Platzierungen. Eine zweite Geräteansicht
fügt einer bestehenden Identität eine **weitere Platzierung** hinzu — **keine Kopie**.
Änderungen an Bindung/Verhalten wirken damit automatisch auf allen Geräten; nur Position/
Format sind pro Breakpoint. Das ist zugleich die Grundlage für kleine Git-Diffs (ADR-0004):
Verschieben auf dem Smartphone berührt nur dessen Platzierung.

### L-2: Zwei Layout-Modi über demselben Modell
- **Modus „Canvas/Pinned" (Power-BI-Weg) — v1-Primärweg.** Pro Breakpoint eine Leinwand mit
  **expliziten Pixel-Platzierungen**. Autor baut z. B. Tablet, wechselt auf Smartphone,
  zieht vorhandene Elemente hinein (→ neue Platzierung), positioniert/formatiert neu.
  Element **nicht** übernommen ⇒ auf diesem Breakpoint `sichtbar:false`. Volle
  Pixelkontrolle, „pro Gerät neu bauen" wird zu „vom Basisgerät ableiten".
- **Modus „Flow/Auto" (Model-driven-Weg) — Nachzügler.** Element wird in einen **Container-/
  Rasterbaum** (Sektionen/Zeilen/Spalten, Größenhinweise) gehängt; der Renderer flowt
  responsiv, **null Pro-Gerät-Arbeit**. Schnell- und Anfängerpfad.

Beide Modi serialisieren in **dasselbe** Element-Identitätsmodell (L-1); sie unterscheiden
sich nur darin, ob eine Platzierung feste Koordinaten oder eine Container-Position trägt.

### L-3: Mischbar
Weil die Identität geteilt ist, darf eine Ansicht Auto-Flow als Default nutzen und
**einzelne Elemente auf einzelnen Breakpoints pinnen** (Override). Kein Entweder-oder.

### L-4: Basis-Breakpoint + Ableitung
Es gibt einen **Basis-Breakpoint** (vom Autor gewählt, z. B. Tablet). Neue Breakpoints
starten als **Ableitung**: Ein Element ohne eigene Platzierung erbt sichtbar seine
Basis-Geometrie als Vorschlag, bis der Autor sie überschreibt. So bleibt „einmal bauen,
dann verfeinern" der Normalfall statt „dreimal bauen".

### L-5: v1-Zusage
v1 liefert **Modus Canvas/Pinned** vollständig (mehrere Breakpoints, Element-Übernahme,
Sichtbarkeit/Format je Breakpoint). Modus Flow/Auto ist als klar abgegrenzter Ausbau
vorgesehen und **blockiert nichts**, weil er dieselbe Datei-Struktur nutzt.

## Konsequenzen

- **R-3 gelöst ohne den USP zu opfern:** pixelgenau *und* mehrgeräte-fähig; das zweite
  Gerät ist ein Derivat.
- **Agent-first & diff-arm (R-5, ADR-0004):** Layout ist Text; Element-Identität und
  Platzierung sind getrennt adressierbar — ein Agent kann eine Smartphone-Ansicht erzeugen,
  indem er Platzierungen hinzufügt, ohne Bindungen/Verhalten zu duplizieren.
- **Ein Editor, zwei Modi** statt zweier unvereinbarer Werkzeuge; frühe Festlegung ist die
  Identität-vs-Platzierung-Trennung (die wir ohnehin wollen).
- **Kosten/Risiken:** Der Editor muss Breakpoint-Umschaltung, Element-Übernahme und
  Vererbungs-Overrides sauber visualisieren; Flow/Auto braucht ein durchdachtes
  Container-/Sizing-Modell (später). Renderer muss beide Platzierungsarten beherrschen.
- **Berührt:** SPEC-003 R-3 (Responsive-Modell konkretisiert), SPEC-003 R-8 (Bindungsrollen
  als Teil der geräteunabhängigen Identität). Format-Overrides je Platzierung siehe
  **ADR-0011**.
