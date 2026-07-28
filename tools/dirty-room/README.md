# Dirty Room — Format erfassen, ohne den Importer zu verunreinigen

Fachwerk importiert Anlagen aus einem Altsystem. Damit dabei nichts aus dessen
Quellcode in Fachwerk gerät, gilt die klassische Zweiteilung:

| | wer | sieht den Quellcode | schreibt |
|---|---|---|---|
| **Dirty Room** | Betreiber + ein Modell **seiner** Wahl | ja | eine Beschreibung des Verhaltens |
| **Clean Room** | wer den Importer baut | **nie** | den Importer, allein aus dieser Beschreibung |

`extrahiere.sh` ist das Werkzeug der linken Spalte. Es läuft **auf deiner
Maschine**, spricht ausschließlich mit **deinem** Ollama-Host und schickt
nichts sonstwohin. Damit wird die Trennung mechanisch statt eine Frage der
Disziplin — niemand muss sich merken, was er gerade nicht lesen darf.

## Voraussetzungen

- `bash`, `curl` und **entweder** `jq` **oder** Python — was da ist, wird
  benutzt. In der Git-Bash unter Windows gibt es kein `jq`; dort greift Python.
- ein erreichbarer Ollama-Host mit einem Modell, das Code lesen kann

## Benutzung

Erst schauen, was überhaupt verschickt würde — das kostet nichts:

```bash
./extrahiere.sh --aufgabe befehle --quelle /pfad/zur/altanlage --trocken
```

Dann der echte Lauf:

```bash
./extrahiere.sh --aufgabe befehle \
                --quelle /pfad/zur/altanlage \
                --host http://192.168.11.50:11434 \
                --modell qwen2.5-coder:32b \
                --ziel _ingest/visu-befehle.md
```

Vier Aufgaben, einzeln ausführbar: `befehle`, `controltypen`, `varfelder`,
`slots`. Was sie jeweils erfragen, steht in
`docs/auftraege/AUFTRAG-INTEROP-KATALOG.md`.

## Wie es arbeitet

1. **Suchen statt alles schicken.** Nur Ausschnitte um echte Fundstellen gehen
   an das Modell — ein ganzer Quellbaum passt in kein Kontextfenster, und was
   nicht hineinpasst, wird still abgeschnitten.
2. **Fenster verschmelzen.** Benachbarte Fundstellen werden zu einem Ausschnitt
   zusammengezogen, damit eine Fallunterscheidung nicht mitten entzweigeht —
   sonst entsteht eine lückenhafte Liste, die niemandem auffällt.
3. **Zusammenführen.** Ein zweiter Durchgang macht aus den Teilergebnissen eine
   Tabelle; Widersprüche werden auf `unklar` gesetzt, nicht weggeglättet.
4. **Vollständigkeitsprobe.** Zum Schluss wird geprüft, ob bekannte Werte im
   Ergebnis vorkommen. Fehlen sie, hat das Modell abgekürzt und du bekommst
   eine Warnung statt eines stillen Halbergebnisses.

Stellschrauben:

| Schalter | Zweck |
|---|---|
| `--endungen php,js` | welche Dateitypen durchsucht werden (Standard `php,js,inc,phtml,html`) |
| `--behalte` | Zwischenstände aufheben statt löschen — für die Fehlersuche |
| `KONTEXT=180` | Zeilen um einen Treffer (Standard 120) |
| `MAX_ZEILEN=900` | Obergrenze je Anfrage (Standard 600) |

## Wenn das Ergebnis nicht glaubwürdig ist

**„Der Quellbaum enthält keine Informationen über …"** — das ist fast nie wahr,
sondern meist eine zu enge Suche. Eine Visu läuft im Browser; was beim Klick
passiert, steht dann in JavaScript, nicht in PHP. Prüfen:

```bash
./extrahiere.sh --aufgabe befehle --quelle /pfad --trocken
```

Zeigt der Trockenlauf nur `.php`-Dateien, obwohl im Baum `.js` liegt, war die
Suche schuld. `--endungen` erweitern und neu.

**Ergebnis wirkt zusammengestückelt** — dann lag es an der Zusammenführung.
Mit `--behalte` laufen lassen und im Arbeitsverzeichnis nachsehen: dort stehen
die Teilergebnisse einzeln, oft brauchbarer als die geglättete Fassung.

**Umlaute verstümmelt** (`Ã¤` statt `ä`) — das war ein Fehler des Skripts unter
Windows und ist behoben; bei einem alten Ergebnis hilft nur ein neuer Lauf.

## Vor der Weitergabe: auf Codereste prüfen

```bash
./pruefe.sh _ingest/visu-befehle.md
```

Der Prüfer meldet, **wo** etwas nach Quelltext aussieht — nie **was** dort
steht. So kannst du die Stellen selbst ansehen und bereinigen, ohne dass der
Inhalt auf dem Weg dorthin irgendwo landet.

Die Grenze:

| | Urteil |
|---|---|
| Feld-, Tabellen-, Spaltennamen (`cmdid1`, `editVisuCmdList`) | unbedenklich — Formatfakten |
| Funktionsname als Fundstelle | erlaubt, für den Importer aber wertlos |
| Beschreibung, **was** passiert | genau das ist gesucht |
| Codezeilen, Fragmente, kopierte Kommentare | raus |

Fehlalarme sind eingeplant — eine geschweifte Klammer steht auch mal in einer
Beschreibung. Einmal zu viel hinsehen ist billiger als eine übersehene
Codezeile.

## Das Ergebnis ist ein Entwurf, kein Befund

Ein Modell, das ohne Beleg „sicher" schreibt, ist der teuerste Fehler in dieser
Kette: daraus entsteht ein Importer, der schweigend falsch arbeitet, und das
fällt erst auf dem Panel des Betreibers auf. Deshalb trägt jede Zeile eine
Sicherheitsangabe.

**Vor der Weitergabe durchlesen.** Alles mit `unklar` entweder selbst prüfen
oder streichen. Und was der Importer nicht sicher weiß, rät er nicht — es
landet im Migrations-Report, damit der Betreiber es sieht.

Und `sicher` ist keine Garantie: in einem Probelauf hat das Modell für Spalten,
zu denen der Ausschnitt gar nichts hergab, Zieltabellen wie `Tabelle1.ID`
erfunden — und sie als `sicher` eingestuft. Ein Modell weiß nicht, was es nicht
weiß. Deshalb ist der Lesedurchgang kein Feinschliff, sondern der Schritt, der
über die Brauchbarkeit entscheidet.
