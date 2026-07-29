# AUFTRAG INTEROP-KATALOG: das Visu-Format vollständig erfassen (Dirty Room)

- **Ausführender:** ein LLM mit Zugriff auf die Altanlage (Dirty Room), NICHT
  Spur 1. Vier eigenständige Teilaufträge, einzeln ausführbar.
- **Ergebnis:** je eine Datei unter `_ingest/`. Vom Betreiber geprüft, dann von
  Spur 1 nach `research/` übernommen und im Importer umgesetzt.

## Warum vollständig statt bedarfsgetrieben

Bisher wurde dreimal einzeln nachgefragt (Größen-Slots, dann s11, dann zwei
Befehlstypen). Jede Frage kostete eine Runde, und jede Antwort deckte nur den
Fall ab, der im Export **eines** Betreibers vorkam.

Fachwerk soll aber die Anlagen **beliebiger** Betreiber importieren. Was in
einem Export fehlt, ist kein Beleg dafür, dass es das Format nicht kennt — es
ist nur ein Beleg dafür, dass dieser eine Betreiber es nicht benutzt hat.

Deshalb: **die Definition erfassen, nicht die Stichprobe.**

Der Bestand einer realen Anlage taugt trotzdem — als **Vollständigkeitsprobe**.
Eine Antwort, die einen der folgenden bekannten Werte nicht enthält, ist
unvollständig:

| Feld | belegt vorhanden |
|---|---|
| `controltyp` | 0, 1, 12, 15, 21, 1004 (custom) |
| `editVisuCmdList.cmd` | 2, 4, 6 |
| `editVisuPage.pagetyp` | 0, 2 |
| Design-Slots | s1–s6, s9–s15, s18–s32, s35, s37–s42, s44 |

---

## Ausführung mit einem lokalen Modell

Die vier Teile lassen sich mit `tools/dirty-room/extrahiere.sh` gegen einen
eigenen Ollama-Host abarbeiten — ohne Kontingent, und die Daten verlassen das
eigene Netz nicht. Das Skript sucht die Fundstellen selbst und legt dem Modell
nur Ausschnitte vor; die Regeln unten stecken bereits darin. Siehe
`tools/dirty-room/README.md`.

Die Prompts unten bleiben trotzdem hier: sie sind die Vorlage, wenn jemand die
Aufgabe von Hand oder mit einem anderen Werkzeug erledigt.

## Ausführung mit einem Agenten, der selbst Dateien liest

Ein Editor-Agent (Cursor, Continue, Aider …) braucht das Zerteilen nicht — er
sucht selbst. Dann gelten dieselben Prompts, nur ohne den Satz über
Ausschnitte. Drei Regeln kommen hinzu, und die erste ist die wichtigste:

1. **Nur den Quellordner öffnen.** Niemals Altanlage und Fachwerk im selben
   Arbeitsbereich. Sonst kann der Agent Quelltext direkt in Fachwerk-Dateien
   schreiben — dann ist die Trennung nicht mehr theoretisch verletzt, sondern
   tatsächlich.
2. **Ergebnis außerhalb ablegen**, erst nach `pruefe.sh` und eigener Durchsicht
   nach `_ingest/` kopieren.
3. **Nur lesen.** Änderungen am Quellbaum sind nicht Teil der Aufgabe; wo es
   geht, den Agenten auf einen Lesemodus stellen.

Läuft der Agent auf demselben Anbieter wie die Fachwerk-Seite, ist die Trennung
nur noch eine zwischen Sitzungen statt zwischen Anbietern. Das trägt, ist aber
schwächer als ein harter Schnitt — eine bewusste Entscheidung, keine
Nebensache.

## Gemeinsame Regeln (gelten für ALLE vier Teilaufträge)

```
HARTE REGELN

1. Die Antwort enthält KEINEN Quellcode der Altanlage und kein Zitat daraus.
   Beschrieben wird ausschliesslich VERHALTEN und die Bedeutung von Feldern.
   Funktions- und Dateinamen als Fundstelle zu nennen ist in Ordnung.

2. VOLLSTAENDIGKEIT vor Kuerze. Gesucht ist die Liste, die das System selbst
   definiert - nicht die Werte, die in einer bestimmten Anlage vorkommen.
   Ein Wert, den du nicht in einer Anlage siehst, gehoert trotzdem in die
   Liste, wenn das System ihn kennt.

3. UNSICHERHEIT WIRD MARKIERT, NICHT GEGLAETTET. Jede Zeile bekommt eine
   Spalte "Sicherheit" mit genau einem Wert:
     sicher    - aus der Definition eindeutig ablesbar
     plausibel - aus dem Zusammenhang erschlossen, nicht direkt belegt
     unklar    - nicht ermittelbar
   Eine als "sicher" markierte Falschaussage ist der teuerste Fehler
   ueberhaupt: sie erzeugt einen Importer, der schweigend falsch arbeitet.
   Lieber zehn "unklar" als ein falsches "sicher".

4. Wo ein Feld auf eine andere Tabelle zeigt, nenne die Zieltabelle und die
   Spalte, ueber die verknuepft wird.

5. Format: Markdown mit Tabellen. Deutsch. Keine Einleitung, keine
   Zusammenfassung am Ende - die Tabelle IST das Ergebnis.
```

---

## Teil 1 — `controltyp` vollständig → `_ingest/controltypen.md`

```
Erfasse ALLE Elementtypen (controltyp), die das Visu-System kennt.

Fuer jeden Typ:
  - Nummer
  - Bezeichnung in der Oberflaeche
  - Wozu er dient, in einem Satz
  - Was der Bediener sieht und was er damit tun kann
  - Welche KO-Felder er benutzt (gaid = KO1, gaid2 = KO2, gaid3 = KO3) und
    wofuer jeweils
  - Welche var-Felder er auswertet (nur die Nummern; Details kommen in Teil 3)
  - Ob er interaktiv ist oder reine Anzeige
  - Sicherheit (sicher/plausibel/unklar)

Ausserdem:
  - Wie ist der Nummernraum aufgeteilt? Woran erkennt man ein mitgeliefertes
    Element gegenueber einem nachtraeglich installierten Custom-Element
    (z. B. 1004)? Gibt es eine Grenze, ab der Custom beginnt?
  - Gibt es controltypen, die nur intern vorkommen und nie in einer Visu
    sichtbar sind?

Bekannt vorhanden (muessen enthalten sein): 0, 1, 12, 15, 21, 1004.
```

## Teil 2 — Befehle vollständig → `_ingest/visu-befehle.md`

```
Erfasse ALLE Befehlsarten in editVisuCmdList.

Die Tabelle hat die Spalten: id, targetid, cmd, cmdid1, cmdid2, cmdoption1,
cmdoption2, cmdvalue1, cmdvalue2.

Fuer JEDEN moeglichen Wert von cmd:
  - Nummer und Bezeichnung
  - Was der Befehl bewirkt, wenn das Element bedient wird
  - Belegung JEDER der sechs Spalten cmdid1, cmdid2, cmdoption1, cmdoption2,
    cmdvalue1, cmdvalue2 fuer genau diesen cmd: Bedeutung, Datentyp, und
    worauf eine id zeigt (welche Tabelle, welche Spalte)
  - Welche Spalten bei diesem cmd unbenutzt bleiben
  - Sicherheit (sicher/plausibel/unklar)

Ausserdem:
  - Wann werden mehrere Befehle eines Elements ausgefuehrt - alle, in welcher
    Reihenfolge, oder nur der erste passende?
  - Gibt es Befehle, die NICHT beim Klick ausgeloest werden, sondern zu einem
    anderen Zeitpunkt (Seitenaufbau, Wertaenderung)? Woran erkennt man das?
  - Wie haengt das Feld var3 des Elements (Bitmaske: 1=Seitensteuerung,
    2=Befehle, 4=KO2 setzen) mit dieser Tabelle zusammen? Werden Befehle nur
    ausgefuehrt, wenn Bit 2 gesetzt ist?

Bekannt vorhanden (muessen enthalten sein): cmd 2, 4, 6.
```

## Teil 3 — `var1`..`var20` je controltyp → `_ingest/visu-var-felder.md`

```
Die Tabelle editVisuElement hat generische Felder var1 bis var20 (evtl. mehr -
bitte die tatsaechliche Anzahl nennen). Ihre Bedeutung haengt vom controltyp ab.

Erfasse je controltyp, welche var-Felder ausgewertet werden, und pro Feld:
  - Bedeutung in einem Satz
  - Datentyp und Wertebereich; bei Aufzaehlungen ALLE Werte mit Bedeutung;
    bei Bitmasken jedes Bit einzeln
  - Standardverhalten, wenn das Feld leer ist
  - Sicherheit (sicher/plausibel/unklar)

Beginne mit controltyp 1 (Universalelement) - er ist der mit Abstand
haeufigste. Bereits bekannt und nur zu bestaetigen bzw. zu vervollstaendigen:
  var3  = Klick-Aktion als Bitmaske (1=Seitensteuerung, 2=Befehle, 4=KO2 setzen)
  var15 = Wert, der bei Klick auf KO2 geschrieben wird
  var11 = Symbolposition
Unbekannt und gesucht: var1, var2, var4..var10, var12..var14, var16..var20.

Nenne ausserdem die Bedeutung dieser Element-Spalten, die bisher ignoriert
werden: dynstylemode, galive, groupid, hascmd, initonly, layer, linkid.
```

## Teil 4 — Design-Slots: Aufzählungen und Ziele → `_ingest/slot-details.md`

```
Die Bedeutung der Design-Slots s1..s48 liegt bereits vor (siehe
_ingest/groessen-slots.md). Was fehlt, sind die konkreten Kodierungen.

1. Nenne fuer JEDEN Slot, der eine Aufzaehlung enthaelt, ALLE gueltigen Werte
   mit ihrer Bedeutung - insbesondere:
     s16 Schriftstil, s17 Schriftstaerke, s18 Textausrichtung,
     s32 Rahmenstil, s38 Boxschatten-Richtung
   sowie jeden weiteren Slot mit fester Werteliste.

2. Nenne fuer jeden Slot, der auf eine Tabelle zeigt (editVisuBGcol,
   editVisuFGcol, editVisuFont, editVisuImg, editVisuAnim), den Aufbau der
   Zieltabelle: welche Spalte den anzuzeigenden Wert traegt, und wie ein
   Verlauf, eine Schrift bzw. eine Animation dort gespeichert ist.

3. Wie wird aus editVisuAnim eine Animation? Welche Spalten, welche
   Entsprechung in heutigem CSS, und wie wirken s40 (Dauer) und s41
   (Wiederholungen) darauf?

4. Bei bedingten Designs (styletyp 1): was passiert, wenn MEHRERE Bedingungen
   gleichzeitig zutreffen? Gewinnt die erste, die letzte, die engste? Und
   was gilt, wenn s1/s2 keine Zahlen, sondern Text enthalten - wird dann
   verglichen oder auf Gleichheit geprueft?

5. Ist s7 (Rotation) in Grad, und um welchen Punkt wird gedreht?

Jede Zeile mit Sicherheit (sicher/plausibel/unklar).
```

---

## Danach

Spur 1 setzt die Ergebnisse in dieser Reihenfolge um — jeweils gegen einen
echten Export geprüft:

1. **Teil 2** (Befehle) — bringt die Klicks zum Laufen, die heute nichts tun.
2. **Teil 1** (controltypen) — schliesst die Lücken bei Reglern und Diagrammen.
3. **Teil 4** (Slot-Kodierungen) — 13 von 25 belegten Slots werden heute
   ignoriert; das ist der Unterschied zwischen „ähnlich" und „wie vorher".
4. **Teil 3** (var-Felder) — Feinheiten einzelner Elementtypen.

Was als `unklar` zurückkommt, wird **nicht** geraten: es wird im
Migrations-Report gezählt, damit der Betreiber es sieht.
