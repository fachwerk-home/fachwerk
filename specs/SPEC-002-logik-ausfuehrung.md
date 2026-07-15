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

## A-8 präzisiert: Zeitverhalten (verbindlich ab Phase 4)

- **T-1 Timer gehören der Engine, nicht dem Baustein.** Bausteine planen über die
  Kontext-API (`planeTimer(id, ms)` / `brichAb(id)`); die Engine hält alle Timer zentral
  mit **injizierbarer Uhr**. Grund: Determinismus, Testbarkeit, Persistierbarkeit, Trace.
- **T-2 Ein Timer je (Knoten, Id).** Neu planen **ersetzt** den laufenden Timer
  (Treppenlicht-Retrigger = neu planen), abbrechen entfernt ihn. Kein Timer-Zoo.
- **T-3 Ablauf = Ereignis in dieselbe FIFO-Queue (A-3).** Ein Timer-Ablauf startet eine
  eigene Kaskade ab dem Besitzer-Knoten; der Trace weist sie als Timer-Kaskade aus.
  Gleichzeitig fällige Timer feuern deterministisch in Planungsreihenfolge.
- **T-4 Monotone Zeitbasis für Abstände.** Wanduhr-/NTP-Sprünge verändern laufende
  Verzögerungen nicht. Kalender-/Uhrzeit-Trigger (Zeitschaltuhren) sind ein eigenes
  Kapitel (SPEC-005) auf Wanduhr-Basis.
- **T-5 Neustart-Regel (nicht verhandelbar, ADR-0005 E-8).** Timer- und Baustein-Zustand
  werden persistiert. Beim Start werden laufende Timer mit Restlaufzeit fortgesetzt; in
  der Downtime abgelaufene Timer feuern **einmal sofort nach** (im Trace als „nachgeholt"
  markiert; mehrfach Überfälliges kollabiert zu einem Nachhol-Ereignis). Kein
  timergesteuerter Ausgang bleibt hängen.
- **T-6 Knoten-lokaler Zustand.** Bausteine erhalten einen kleinen Schlüssel/Wert-Zustand
  über den Kontext (z. B. „welcher Wert kommt nach der Verzögerung raus"); er wird
  zusammen mit den Timern persistiert.

## Akzeptanzkriterien

- Akzeptanztests gegen den Bus-Simulator (SPEC-008): Glitch-Freiheit im Diamant
  (intra- und cross-sheet), stabile deterministische Reihenfolge, korrekte Trigger-Semantik
  je Eingang, Zyklus- und Mehrfach-Schreiber-Erkennung, Timer-Reproduzierbarkeit.
