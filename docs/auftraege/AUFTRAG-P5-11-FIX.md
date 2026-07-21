# AUFTRAG P5-11-FIX: Logik-Editor — Nachbesserung nach Review — Codex

- **Spur:** 2 (Codex) · **Branch:** `auftrag/p5-11-logik-editor-fix` (Basis: aktueller `origin/main`)
- **Dateibesitz:** `ui/**`. API-Wünsche → PR-Text.
- **Kontext:** P5-11 ist bereits auf `main`, ungeprüft gemergt. Die Spur-1-
  Handprobe hat mergeblockierende Fehler gefunden, die alle Gates überlebt
  haben. Dieser Auftrag behebt sie. **Gezielt reparieren, nicht neu bauen.**

## Zwingend: so wird abgenommen

Grüne Gates reichen nicht. Jeder Punkt braucht einen **Test, der ohne den Fix
rot ist**, plus die Handprobe unten. Wo YAML erzeugt wird: gegen das Schema
(`schema/schemas/logik.schema.json`) validieren, nicht nur String-Vergleich.

## Fehler (nach Schwere)

### F1 (SCHWER): Kante `dp → port.in` lässt sich nicht ziehen
`ui/src/admin/logik-editor.tsx:63-65,321-334`. `istEingang()` gibt für JEDEN
Datenpunkt-Ref `true` zurück (`ref.art === "dp"`). `portClick` bestimmt die
Kantenrichtung allein daraus: die Eingangsseite wird `nach`, die Ausgangsseite
`von`, und `:326` bricht ab, wenn beide Seiten dieselbe Eingangs-Eigenschaft
haben. Folge:
- `port.aus → dp` funktioniert.
- **`dp → port.in` ist unmöglich** — beide Seiten sind `istEingang === true`,
  `:326` verwirft die Aktion. Damit lässt sich die häufigste Kante überhaupt
  nicht bauen: ein Sensor-/Eingangs-Datenpunkt, der einen Baustein treibt.
  Die eigene Fixture nutzt genau das (`logik-yaml.test.ts:12`:
  `{ von: "dp:wohnen.taster", nach: "a.in" }`) — im Editor nicht erzeugbar.

**Fix:** Die Richtung darf nicht aus „ist Datenpunkt" abgeleitet werden. Ein
Datenpunkt kann Quelle ODER Ziel sein; ein Knoten-Port ist durch seine Rolle
(Eingang/Ausgang) festgelegt. Regel: Kante geht immer von einem Ausgang/Quelle
zu einem Eingang/Ziel — ein DP ist Quelle, wenn das andere Ende ein Eingang ist,
sonst Ziel. Test: `dp → port.in` UND `port.out → dp` beide erzeugbar; DP↔DP und
Eingang↔Eingang bleiben verboten. **Das blockiert die Abnahme-Demo (AB #3).**

### F2 (HOCH): Client-Zyklenprüfung weicht von der Engine ab
`ui/src/admin/logik-editor-modell.ts:149-201`. Die Engine
(`core/src/logik/graph.ts:143-160`) schließt **zeitentkoppelte** Bausteine
(`entkoppelt`, nur `VERZOEGERUNG`) aus der Zyklus-Adjazenz aus und baut die
Adjazenz **auch über Datenpunkt-Kanten** (globaler Graph). Der Client macht
beides nicht:
- **Falsch-Positiv:** eine legale Verzögerungs-Rückkopplung
  (`a → VERZOEGERUNG → … → a`) wird als `fehler` markiert, und `aktivieren`
  (`logik-editor.tsx:305-309`) **blockiert damit gültige Logik**.
- **Falsch-Negativ:** ein über einen Datenpunkt geschlossener Zyklus
  (`a.out → dp:x → b.in → … → a`) wird client-seitig NICHT erkannt (die Engine
  schon) — AB #4 (Zyklus vor Aktivieren mit Ort melden) ist damit für
  DP-vermittelte Zyklen nicht erfüllt.

**Fix:** `entkoppelt` je Baustein aus dem Katalog übernehmen (Stdlib-Info; für
eigene Bausteine aus `/api/gewerk`, falls verfügbar — sonst API-Wunsch) und aus
der Zyklus-Adjazenz ausschließen; DP-Kanten in den Graphen aufnehmen. Test mit
(a) Verzögerungs-Loop = kein Fehler, (b) DP-Zyklus = Fehler mit Ort.
**Alternativ/ergänzend:** den client-seitigen Blocker entschärfen und stattdessen
serverseitig validieren (siehe F3) — die Engine hat die Wahrheit.

### F3 (HOCH): „Aktivieren" schaltet den Plattenstand scharf, nicht den Editor
`ui/src/admin/logik-editor.tsx:304-320` (+ `:241`, `:290-303`). `aktivieren`
ruft `api.aktiviereGewerk()` ohne Bezug zur aktuellen `seite`; die blockierende
Validierung (`:241`) läuft auf dem In-Memory-Stand. Bei `dirty` aktiviert der
Button also die zuvor gespeicherte Datei — nicht das, was der Nutzer sieht und
was validiert wurde. Kein „erst speichern"-Zwang, keine Dirty-Warnung.
**Fix:** Aktivieren speichert vorher (oder verlangt Speichern) und validiert den
Stand, der scharf geschaltet wird. Gilt genauso für den Visu-Editor — bitte
konsistent lösen.

### F4 (MITTEL): Kantenlose/knotenlose Seite → schema-ungültiges YAML
`ui/src/admin/logik-yaml.ts:26-53,68-83` vs `logik.schema.json:36-40`. Schema
verlangt `kanten` als Array mit `minItems: 1`. Eine geänderte Seite mit null
Kanten (Knoten platziert, noch nicht verdrahtet) erzeugt `kanten:` ohne Kind →
parst zu `null` → verletzt `type: array` und `minItems`. Gleiches Muster für
leeres `knoten:` → `null` (verletzt `minProperties: 1`). Das ist ein normaler
Editier-Zwischenstand. **Fix:** wie P5-10-FIX/F1 — leere Container gültig
serialisieren bzw. Speichern erst zulassen, wenn die Seite schema-fähig ist,
mit klarer Meldung statt still ungültiger Datei.

### F5 (MITTEL): String-Skalare kippen den Typ
`ui/src/admin/logik-yaml.ts:7-13` + `logik-editor.tsx:67-78`. `skalar` quotet
`"true"`, `"08:00"`, Zahl-artige Strings nicht → beim Reload Bool/Zahl.
`skalarAusText` coerct schon bei der Eingabe (`"0755"→755`, `"1.0"→1`), verliert
die String-Form vor der Serialisierung. **Fix:** solche Strings quoten und die
Eingabe-Coercion so einschränken, dass sie String-Parameter nicht zerstört.
Test mit `notizen: "true"` und einem Zeit-String.

### F6 (NIEDRIG-MITTEL): Neu gezogene Kante verliert ihren Trigger
`logik-editor.tsx:330-333` + `logik-editor-modell.ts:135-141`. `portClick` baut
`{ von, nach }` ohne `trigger`; `setzeOderErsetzeKante` **ersetzt** eine
bestehende Kante gleicher Endpunkte. Wer eine bereits auf `on-receive` gestellte
Kante neu zieht, setzt sie auf `on-change` zurück. **Fix:** vorhandenen Trigger
beim Ersetzen erhalten.

### F7 (NIEDRIG): Port-Existenz nie geprüft; schrumpfende konfig-variable Ports verwaisen Kanten
`logik-editor-modell.ts:154-173`. `validiereLogik` prüft nur den Knoten, nie den
Port. `SPLIT.anzahl` 3→2 oder ein umbenanntes `EXTRACT`-Feld entfernt Ports
(`portsFuer`, `:84-114`), lässt aber Kanten auf `teil3`/alte Namen stehen — kein
Hinweis, Kante rendert nicht (`:406-408`), wird als toter Verweis gespeichert,
den die Engine ablehnt. **Fix:** Kanten gegen die aktuell existierenden Ports
prüfen und verwaiste melden/entfernen.

## API-Wünsche (aus dem Original-PR, für Spur 1)

- `POST /api/gewerk/validieren` (Datei-Inhalt → Validierung) — dann muss der
  Client Zyklen nicht selbst nachbilden (siehe F2). **Empfehlung:** priorisiert,
  weil es F2 und die halbe F3 an der Wurzel löst.
- Optionales Layout-Feld pro Knoten im Logik-Schema (persistente Positionen).
- Introspektierbarer Stdlib-Katalog über `/api/gewerk` (Manifeste + Parameter +
  konfig-variable Portfunktion + `entkoppelt`), damit die UI-Palette nicht
  hartcodiert ist und F2 auch für eigene Bausteine trägt.

Spur 1 nimmt diese Wünsche gesondert auf; für diesen Auftrag reicht die
Client-Lösung, solange der Endpunkt fehlt.

## Abnahme

1. Alle 4 Gates + UI-Build grün — plus je ein Test pro F1–F6, ohne Fix rot.
2. **Handprobe im PR (GIF) am laufenden Stack mit gescoptem Token** (siehe
   P5-10-FIX „Hinweis Auth"): die Licht-Status-Seite aus Bausteinen nachbauen —
   inklusive einer `dp → port.in`-Kante (F1) — → Aktivieren → Simulator-Injektion
   läuft identisch durch (Monitor zeigt die Kaskade).
3. Absichtlicher Verzögerungs-Loop wird NICHT fälschlich blockiert; ein
   DP-Zyklus wird mit Ort gemeldet.
4. PR offen lassen — **nicht selbst mergen** (AGENTS.md §3.3).
