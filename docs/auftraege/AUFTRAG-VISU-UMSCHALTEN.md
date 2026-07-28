# AUFTRAG VISU-UMSCHALTEN: Umschalter mit Ein-Wert und getrennter Statusquelle (Spur 2)

- **Ausführender:** Codex (Spur 2). Dateibesitz: `ui/**` — sonst nichts.
- **Branch:** `auftrag/visu-umschalten`, zwingend von `origin/main`.
- **Pflichtlektüre:** `AGENTS.md`, `ui/src/visu/bedienen.ts`, `schema/src/visu.ts`
  (Typ `VisuAktion`).

## Warum

Die importierte Visu des Betreibers hat Knöpfe, die nichts tun. Die Ursache lag
im Importer und ist behoben: die Klick-Befehle der Altanlage werden jetzt
übersetzt. Es fehlt nur noch, dass der Renderer die reichere Form **ausführt**.

Zwei Fälle aus dem Bestand des Betreibers, die der einfache Umschalter nicht
trifft:

- Ein Dimmer soll auf **20 %** gehen, nicht auf „wahr". Der Ein-Zustand ist
  also ein Wert, kein Ja.
- Der Zustand steht auf einer **anderen Adresse** als der Schaltbefehl. Auf dem
  Bus ist das die Regel, nicht die Ausnahme: Stellen und Melden sind getrennt.
  Wer beim Umschalten den Wert der Stelladresse liest, bekommt gar nichts oder
  Veraltetes.

## Was die Daten liefern

`VisuAktion` hat dafür zwei **optionale** Felder bekommen (Schema steht schon):

```ts
{ art: "umschalten"; ein?: string | number | boolean; status?: string }
```

| Feld | fehlt | gesetzt |
|---|---|---|
| `ein` | zwischen wahr und falsch wechseln (heutiges Verhalten) | im Ein-Zustand **diesen** Wert schreiben |
| `status` | Zustand am Ziel-Datenpunkt ablesen (heutiges Verhalten) | Zustand an **diesem** Datenpunkt ablesen |

So sieht es in einem importierten Gewerk aus:

```yaml
aktionen:
  kurz:
    art: umschalten
    ein: 20
    status: eg.eg_wohnzimmer_licht_erker_gruen_status_dimmwert
```

## Umfang

`ui/src/visu/bedienen.ts` behandelt heute `art === "umschalten"` und schreibt
das Gegenteil des Ziel-Datenpunkts. Erwartet:

1. Der abgelesene Zustand kommt aus `status`, falls gesetzt — sonst wie bisher
   vom Ziel-Datenpunkt.
2. Gilt der Zustand als **aus**, wird `ein` geschrieben (fehlt `ein`: `true`).
   Gilt er als **an**, wird ausgeschaltet (`0` bei Zahlen, sonst `false`).
3. „Aus" heisst: `0`, `false`, leer oder nicht auswertbar. Alles andere ist an.
   Ein Dimmer, der auf 20 steht, ist an — auch wenn 20 nicht `true` ist.
4. Beide Felder sind optional; ohne sie muss sich **nichts** ändern.

## Nicht-Scope

- `core/**`, `cli/**`, `schema/**`, `importer/**` — die Daten stehen bereits.
- Kein neues Aussehen, keine neue Rückmeldung. Nur die Ausführung.

## Abnahme

- Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün.
- Reine Funktion mit Tests, mindestens: (a) ohne `ein`/`status` unverändertes
  Verhalten; (b) `ein: 20` auf einem Datenpunkt mit Wert 0 schreibt 20;
  (c) derselbe Fall bei Wert 20 schaltet aus; (d) `status` zeigt auf einen
  anderen Datenpunkt und dessen Wert entscheidet, geschrieben wird aber auf
  das Ziel.
- Handprobe im PR gegen `examples/` — Betreiberdaten gehören nicht ins Repo.
