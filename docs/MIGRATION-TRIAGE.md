# Migration: fremde Bausteine einordnen (Triage)

Beim Umstieg von einer Altanlage bleiben Bausteine und Visuelemente übrig, die
Fachwerk nicht kennt. Der Import listet sie in `MIGRATION.md` auf. Diese
Anleitung beantwortet die nächste Frage: **Kann Fachwerk das schon — und wenn
nein, was genau fehlt?**

Fachwerk kann das nicht selbst entscheiden: es kennt die fremden Bausteine
nicht. Ein Sprachmodell kann es, wenn es **beide Seiten** sieht — den fremden
Baustein (der liegt bei dir) und Fachwerks Fähigkeiten-Katalog.

> ## Die eine Regel
>
> Der fremde Baustein bleibt **auf deinem Rechner**. Was du in ein Issue, einen
> Beitrag oder eine öffentliche Diskussion schreibst, ist immer nur eine
> **Beschreibung des Verhaltens** — niemals Quellcode. Fachwerk ist eine
> Neuentwicklung und muss frei von fremdem Code bleiben; ein eingefügter
> Schnipsel gefährdet das ganze Projekt. Für dich privat gilt das nicht: bei
> dir zu Hause darfst du deine Bausteine natürlich weiter benutzen.

## Schritt 1 — Katalog erzeugen

```bash
fachwerk katalog --json > katalog.json
```

Läuft Fachwerk schon, geht es auch ohne Shell: `GET /api/katalog`.

## Schritt 2 — Prompt „Kann Fachwerk das schon?"

Gib deinem Sprachmodell den Katalog, die Beschreibung/Dokumentation des fremden
Bausteins (Handbuchseite, Portliste, Parameter — Quellcode nur lokal) und
diesen Text:

```
Du hilfst bei der Migration einer Gebäudesteuerung auf die Plattform Fachwerk.

Anbei:
1. Fachwerks Fähigkeiten-Katalog (JSON): Standardbausteine mit Zweck, Ports,
   Parametern und Stichworten; Visu-Elemente mit ihren Rollen; Formatfelder.
2. Ein fremder Baustein aus dem Altsystem.

Aufgabe: Entscheide, ob Fachwerk die FUNKTION dieses Bausteins bereits abdeckt.
Antworte in genau einer der drei Formen:

A) NATIV — ein einzelner Fachwerk-Baustein oder ein Visu-Element leistet
   dasselbe. Nenne ihn, ordne die Ports einander zu und benenne Abweichungen
   im Verhalten.

B) ZUSAMMENGESETZT — mehrere Fachwerk-Bausteine ergeben zusammen dasselbe.
   Nenne sie und beschreibe die Verdrahtung (welcher Ausgang auf welchen
   Eingang) sowie die nötigen Parameter.

C) LÜCKE — Fachwerk hat dafür nichts Passendes. Begründe kurz, welche
   Eigenschaft fehlt.

Regeln:
- Rate nicht. Bist du unsicher zwischen B und C, antworte C und benenne das
  Unsichere.
- Reine Anzeigefragen (Einheit, Nachkommastellen, An/Aus-Text, Skalierung)
  sind KEINE Lücke: dafür gibt es die Formatfelder, kein eigener Baustein.
- Zeitfunktionen: In Fachwerk kommt die Uhrzeit als Datenpunkt in den Baustein
  hinein. Ein Baustein, der „selbst auf die Uhr sieht", ist trotzdem nativ
  abbildbar, wenn die Rechnung passt.
- Gib in deiner Antwort KEINEN Quellcode des fremden Bausteins wieder.
```

## Schritt 3 — nur bei „LÜCKE": Anforderung formulieren

```
Der fremde Baustein hat in Fachwerk keine Entsprechung. Formuliere daraus eine
Anforderung, die ein Entwickler ohne Kenntnis des Originals umsetzen kann.

Struktur:
- Titel: eine Zeile, was der Baustein leisten soll
- Zweck: welches Alltagsproblem er löst (1–3 Sätze, aus Sicht des Bewohners)
- Eingänge / Ausgänge: Name, Datentyp, Bedeutung
- Parameter: Name, Bedeutung, sinnvoller Standardwert
- Verhalten: als Regeln oder Wenn-Dann-Sätze, inklusive Sonderfällen
  (Was bei unbelegtem Eingang? Was nach Neustart? Zeitverhalten?)
- Abnahmebeispiele: mindestens drei Zeilen „Eingaben → erwartete Ausgabe"

Beschreibe ausschließlich beobachtbares VERHALTEN. Übernimm keine
Formulierungen, Bezeichner oder Codezeilen aus dem Original. Schreibe so, dass
jemand den Baustein von Grund auf neu bauen kann, ohne das Original je gesehen
zu haben.
```

Das Ergebnis passt als Feature-Request ins Repo:
https://github.com/fachwerk-home/fachwerk/issues

## Was mit dem Rest passiert

- **NATIV / ZUSAMMENGESETZT** → im Logik-Editor nachbauen. Der Import hat die
  Verdrahtung schon übernommen; du ersetzt nur den Platzhalter (Stub).
- **LÜCKE** → Feature-Request. Oder selbst bauen: `docs/BAUSTEIN-SDK.md`
  beschreibt, wie eigene Bausteine entstehen (eine Datei, kein Werkzeugkasten
  nötig). Beiträge sind willkommen — siehe `CONTRIBUTING.md`.
- **Solange etwas fehlt**, läuft die Anlage weiter: unbekannte Bausteine sind
  als Stub importiert, die Stelle ist inert und im Logik-Monitor markiert. Du
  kannst auch beide Systeme eine Zeit lang parallel betreiben und die exotische
  Logik vorerst im Altsystem lassen — beide reden über den Bus miteinander.
