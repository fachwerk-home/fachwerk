# specs/ — Funktionale Spezifikationen

Quelle der Wahrheit für das Verhalten von Fachwerk. Eine Spec pro Subsystem
(Datenpunkt-/KO-Modell, Logik-Ausführungsmodell, Visu-Elemente, Archive, Szenen/Timer,
Backup, KNX-Treiber, MCP-API …).

Regeln:

- Specs beschreiben **beobachtbares Verhalten** aus Nutzersicht — entstanden aus
  Black-Box-Beobachtung und öffentlichem Wissen, niemals aus EDOMI-Quellcode
  (Clean-Room-Policy, siehe CONTRIBUTING.md).
- Jede Spec bekommt ausführbare Akzeptanzkriterien (ab Phase 3 als Tests gegen den
  KNX-Simulator).
- Änderungen am spezifizierten Verhalten laufen als PR gegen die Spec, nicht nur gegen
  den Code.

Die Spec-Arbeit startet mit Phase 1 (siehe docs/ANALYSE-UND-PLAN.md).
