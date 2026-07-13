# ADR-0005: Ausführungsmodell der Logik-Engine

- **Status:** Akzeptiert (2026-07-09)
- **Datum:** 2026-07-09
- **Entscheider:** Projektgründer (mit co-agentischer Analyse)
- **Präzisiert im Review:** E-2 „settle" ist strukturell, nie zeitlich (5/7-Minuten-Fall);
  E-2b Propagation folgt Datenpunkt-Kanten über Seitengrenzen (mehrdimensionaler Diamant).

## Kontext

Die Logik-Engine ist Fachwerks Kern. Ereignisgetriebene Logik-Engines im Smarthome haben
bekannte Fallstricke, die Fachwerk konstruktiv vermeiden soll:
- **Poll-Schleifen** koppeln Latenz an die Zykluszeit und erzeugen Idle-CPU-Last.
- **Konvergenz-Glitches:** Ein Baustein, den ein Ereignis über mehrere Pfade erreicht, wird
  pro eintreffendem Pfad ausgewertet und sendet dabei einen falschen Zwischenwert, bevor er
  sich einschwingt.
- **Unsichtbare Reihenfolge:** Die Auswertungsreihenfolge ist zwar deterministisch, aber
  nirgends sichtbar — Nutzer können Abläufe nicht nachvollziehen.
- **Schreibkonflikte:** Schreibt mehr als ein Flow denselben Datenpunkt, entscheidet die
  (unkontrollierbare) Ankunftsreihenfolge über das Ergebnis („last writer wins").
- **Fehlende Eindämmung:** rückgekoppelte Zyklen laufen unbegrenzt.

Ziel: **deterministisch, glitch-frei, sichtbar, latenzarm** — und statisch prüfbar.

## Entscheidung

### E-1: Ereignisgetrieben statt Poll
Fachwerk reagiert **direkt** auf Datenpunkt-Ereignisse (kein Poll-Zyklus). Kein Idle-CPU,
Latenz nicht an eine Zykluszeit gekoppelt. Passt zum TS-Event-Loop (ADR-0003).

### E-2: Logik als Abhängigkeitsgraph, **topologische Auswertung — jeder Baustein einmal je Propagation**
Die Logikseite ist ein expliziter Graph (ADR-0004). Ein eintreffendes Ereignis markiert die
betroffenen (nachgelagerten) Bausteine „dirty", sortiert sie **topologisch** und wertet
jeden **genau einmal** aus, **nachdem alle seine Eingänge dieser Propagation gesettelt
sind**. → **„Settle before evaluate".** Ein Konvergenzbaustein (UND zweier Zweige aus einem
Trigger) läuft erst, wenn beide Zweige berechnet sind — **kein Glitch, per Konstruktion**.
So arbeiten glitch-freie Dataflow-/Tabellenkalkulations-/HDL-Engines.

**Präzisierung — „gesettlet" ist strukturell, nicht zeitlich (wichtig!):** Die Engine
wartet **niemals** auf zukünftige Ereignisse. „Settle" bezieht sich ausschließlich auf die
**Pfade innerhalb der aktuellen Kaskade** (statisch aus dem Graph bekannt). Eingänge, die
vom auslösenden Ereignis **nicht** abstammen, behalten ihren **letzten bekannten Wert** —
auf sie wird nicht gewartet. Konsequenz für unabhängige Quellen (Beispiel: zwei periodische
Datenpunkte alle 5 und alle 7 Minuten auf einem gemeinsamen Baustein D):
- Jedes Ereignis erzeugt seine **eigene** Kaskade; D rechnet **pro Ereignis einmal** mit dem
  frischen Wert des Auslösers und den letzten bekannten Werten aller übrigen Eingänge
  (Min 10 nutzt den 7er-Wert von Min 7; Min 15 den von Min 14).
- Feuern beide „gleichzeitig" (Min 35): zwei Kaskaden in Queue-Reihenfolge (E-3), D läuft
  zweimal, der zweite Lauf sieht beide frischen Werte — sichtbar im Trace (E-5).
- Wer Barrier-Semantik über unabhängige Quellen will („rechne erst, wenn beide frisch
  geliefert haben"), nutzt einen **expliziten Join-Baustein** mit definierten Regeln
  (Frische-Fenster/Reset) — niemals implizite Engine-Magie.

### E-2b: Propagation folgt Datenpunkt-Kanten — über Seitengrenzen hinweg
Datenpunkte sind Knoten **desselben globalen Graphen** wie Bausteine; eine Kaskade endet
**nicht** an der Logikseiten-Grenze. Schreibt Flow 1 mitten im Durchlauf einen Datenpunkt A,
der Flow 2 triggert, welcher B schreibt, das wiederum ein späterer Eingang in Flow 1 ist
(mehrdimensionaler Diamant), dann gehört Flow 2 zur **selben Propagation**: topologische
Ordnung global, Flow-1-spät wird **einmal** ausgewertet, **nachdem** B geschrieben wurde —
frischer Wert, kein Stale-Read, kein Doppel-Feuern.
**Begründung (Kompositionsprinzip):** Logik auf mehrere Seiten zu verteilen darf die
Semantik nicht ändern — sonst bestraft die Engine sauberes Strukturieren.
Randfälle: (a) Nicht-triggernde Lese-Eingänge werden trotzdem geordnet (Ordnung kommt aus
dem Graphen, Trigger-Konfig entscheidet nur übers Feuern bei alleiniger Änderung).
(b) Bedingte Schreiber: konservative statische Ordnung; ohne Schreiben gilt der letzte
bekannte Wert. (c) Zyklen über Seitengrenzen/Datenpunkte werden **statisch global** erkannt
(E-6 folgt Datenpunkt-Kanten) und müssen explizit gebrochen werden (Verzögerungs-/
Defer-Baustein). (d) Kosten: Kaskaden können groß werden (akzeptiert bei
Gebäudeautomations-Last; vollständig im Trace sichtbar).

### E-3: Atomare Kaskaden (definierte Nebenläufigkeit)
Ereignisse laufen über **eine FIFO-Queue** (Ankunftsreihenfolge). Die Kaskade eines Triggers
läuft **vollständig zu Ende, bevor** die nächste beginnt — **keine Verschränkung zweier
Kaskaden**. Damit ist jede Kaskade in sich deterministisch und konsistent (kein
Mid-Cascade-Race). Die Reihenfolge *zwischen* unabhängigen Kaskaden folgt der Ankunft
(vom Bus bestimmt — inhärent, nicht wegdefinierbar), ist aber im Trace sichtbar.

### E-4: Trigger-Semantik **pro Eingang konfigurierbar**
Default **„on change"** (weniger redundante Arbeit); optional **„on receive"** (jedes
Telegramm feuert, für Fälle, die das brauchen — z. B. Taster-Wiederholung). Explizit und
dokumentiert.

### E-5: Reihenfolge & Ausführung **sichtbar** (Trace)
Jede Kaskade erzeugt einen **Ausführungs-Trace**: welcher Baustein in welcher Reihenfolge,
mit welchen Ein-/Ausgangswerten, Zeitstempel, Auslöser. Die feste Ordnung ist damit
**sichtbar** — der Hauptmangel klassischer Engines.

### E-6: Zyklen statisch + Laufzeit-Backstop
Zyklen werden **zur Projektierungszeit** im Graph erkannt und gemeldet (der Nutzer entscheidet
bewusst, z. B. mit einem markierten „Verzögerungs-Break"). Laufzeit-Iterationsgrenze plus
Telegramm-Sturm-Drossel/Alarm nur als Sicherheitsnetz (kein Freeze, kein unbegrenzter
Sturm).

### E-7: Mehrfach-Schreiber-Linter
Ein **Projektierungszeit-Linter** meldet Datenpunkte, die von mehreren Flows geschrieben
werden. Laufzeitverhalten bleibt **definiert** (last writer wins) und **getraced** — aber der
Nutzer wird zur Bauzeit gewarnt, statt dass der Konflikt unsichtbar bleibt.

### E-8: Zeitbausteine
Timer/Verzögerungen planen zukünftige Ereignisse **in dieselbe Queue** (einheitliches
Modell). Persistenz des Timer-Zustands über Neustart und Verhalten bei Zeitsprüngen werden
spezifiziert und in CI reproduzierbar gemacht.

## Konsequenzen

- **Glitch-frei by design** (E-2) und **deterministisch + sichtbar** (E-3/E-5) — die zwei
  häufigsten Fallstricke ereignisgetriebener Engines sind konstruktiv adressiert. Das ist
  Fachwerks Kern-Überlegenheit.
- **Latenzarm, kein Idle-CPU** (E-1).
- **Statisch prüfbar** (E-6/E-7): eine Klasse von Bugs wird zur Bauzeit sichtbar statt erst
  im Betrieb.
- **Kosten/Risiken:** Der topologische, „settle-before-evaluate"-Kern ist anspruchsvoller
  als eine simple Auswerteschleife; braucht saubere Graph-/Dirty-Propagation und
  Trace-Infrastruktur. Verhalten gegen KNX-Semantik über den Bus-Simulator (SPEC-008)
  in CI absichern.
- **Offen:** Timer-Detailsemantik (Persistenz/Zeitsprünge) vor Implementierung von E-8
  festklopfen.
