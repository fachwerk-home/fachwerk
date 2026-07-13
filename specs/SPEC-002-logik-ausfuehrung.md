# SPEC-002: Logik-Ausführungsmodell

- **Status:** Entwurf (Zielspezifikation)
- **Bezug:** ADR-0005 (Ausführungsmodell — verbindliche Entscheidungen), ADR-0004
  (Logik als expliziter Graph), ADR-0008 (Bausteine)

## Zweck & Geltungsbereich

Das Herzstück: Wann läuft ein Baustein, in welcher Reihenfolge, mit welchen Werten.
Fachwerk ist **ereignisgetrieben, deterministisch, glitch-frei und beobachtbar**. Die
verbindlichen Regeln stehen in ADR-0005; diese Spec fasst die daraus folgenden
prüfbaren Anforderungen zusammen.

## Anforderungen

- **A-1 Ereignisgetrieben:** Reaktion direkt auf Datenpunkt-Ereignisse, kein Poll-Zyklus.
- **A-2 Settle before evaluate:** Logik ist ein Abhängigkeitsgraph; je Propagation wird
  jeder Baustein **einmal** ausgewertet, nachdem alle seine Eingänge dieser Propagation
  berechnet sind. Konvergenzbausteine erzeugen keine falschen Zwischenwerte (glitch-frei).
  „Settle" ist strukturell (Graph), nie zeitlich — es wird nie auf zukünftige Ereignisse
  gewartet; nicht betroffene Eingänge behalten ihren letzten Wert.
- **A-2b Über Seitengrenzen:** Datenpunkte sind Knoten desselben globalen Graphen; eine
  Propagation endet nicht an der Logikseiten-Grenze (Kompositionsprinzip: Aufteilen darf
  die Semantik nicht ändern).
- **A-3 Atomare Kaskaden:** eine FIFO-Ereignisqueue; jede Kaskade läuft vollständig, bevor
  die nächste startet (definierte Nebenläufigkeit, keine Verschränkung).
- **A-4 Trigger pro Eingang konfigurierbar:** Default „on change"; optional „on receive".
  Explizit und dokumentiert.
- **A-5 Ausführungs-Traces (Pflicht):** je Kaskade nachvollziehbar, welcher Baustein wann,
  warum, mit welchen Werten lief — die feste Ordnung ist sichtbar.
- **A-6 Zyklen statisch + Backstop:** Zyklen (auch über Datenpunkt-Kanten/Seitengrenzen)
  werden zur Projektierungszeit erkannt und gemeldet; Laufzeit-Iterationsgrenze +
  Telegramm-Sturm-Drossel/Alarm als Sicherheitsnetz.
- **A-7 Mehrfach-Schreiber-Linter:** Datenpunkte, die von mehreren Flows geschrieben
  werden, werden zur Projektierungszeit gemeldet (Warnung vor Schreibkonflikten).
- **A-8 Zeitbausteine:** Timer/Verzögerungen planen Ereignisse in dieselbe Queue; Zustand
  und Verhalten über Neustart/Zeitsprünge sind spezifiziert und in CI reproduzierbar.

## Akzeptanzkriterien

- Akzeptanztests gegen den Bus-Simulator (SPEC-008): Glitch-Freiheit im Diamant
  (intra- und cross-sheet), stabile deterministische Reihenfolge, korrekte Trigger-Semantik
  je Eingang, Zyklus- und Mehrfach-Schreiber-Erkennung, Timer-Reproduzierbarkeit.
