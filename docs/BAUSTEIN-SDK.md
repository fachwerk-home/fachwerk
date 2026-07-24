# Baustein-SDK — eigene Bausteine schreiben

**Null-Toolchain-Zusage (ADR-0008):** Ein Baustein ist plain JavaScript. Kein npm, kein
Build, kein TypeScript nötig. Verzeichnis anlegen, zwei Dateien, fertig.

## Aufbau

```
<gewerk>/bausteine/mein_baustein/
  manifest.yaml    # Metadaten + Testvektoren
  baustein.js      # die Logik (ESM, default-Export)
```

### manifest.yaml

```yaml
id: mein_baustein        # = Verzeichnisname, klein_geschrieben
name: Mein Baustein
version: 1
beschreibung: Was er tut.
eingaenge: [in]
ausgaenge: [out]
parameter:               # Defaults, im Gewerk je Knoten überschreibbar
  faktor: 2
tests:                   # fachwerk baustein test führt sie aus
  - eingaenge: { in: 3 }
    erwartet: { out: 6 }
```

### baustein.js

```js
export default function rechne(eingaenge, ctx) {
  if (typeof eingaenge.in !== "number") return null; // keine Ausgabe
  return { out: eingaenge.in * Number(ctx.parameter.faktor ?? 2) };
}
```

## Der Kontext (`ctx`)

| Feld | Bedeutung |
|---|---|
| `ctx.parameter` | Parameter des Knotens (Manifest-Defaults + Gewerk-Overrides) |
| `ctx.zustand` | Schlüssel/Wert-Zustand des Knotens — **überlebt Neustarts** (SPEC-002 T-6) |
| `ctx.ausloeser` | `{ art: "eingang" }` oder `{ art: "timer", id, nachgeholt }` |
| `ctx.planeTimer(id, ms)` | plant/ersetzt den Timer `(knoten, id)` — Ablauf ruft den Baustein mit `ausloeser.art === "timer"` erneut auf |
| `ctx.brichAb(id)` | bricht einen geplanten Timer ab |

Rückgabe: ein Objekt `{ portname: wert }` — oder `null` für „keine Ausgabe".

## Regeln (und warum)

- **Rein rechnen.** Kein Netz, kein Dateisystem, keine globale Uhr (`Date.now`/`Math.random`
  sind nicht deterministisch — wer Zeit braucht, nutzt Timer; wer Systemdaten braucht,
  bindet einen System-Datenpunkt). Dienste-Bausteine (HTTP etc.) kommen als eigene
  Kategorie später (ADR-0008 „service").
- **Zeitlimit:** Ein Aufruf hat ~100 ms. Endlosschleifen beenden den Baustein-Worker;
  der Fehler steht im Trace, die Anlage läuft weiter.
- **Kaskaden-Semantik:** Der Baustein läuft höchstens einmal je Kaskade, nachdem alle
  seine Eingänge gesettelt sind (ADR-0005). Nicht ausgelöste Eingänge tragen den letzten
  bekannten Wert.

## Lokal testen

```
fachwerk baustein test <gewerk-verzeichnis>   # führt die Manifest-Testvektoren aus
fachwerk validate <gewerk-verzeichnis>        # prüft Manifest + Verdrahtung
```

Beispiel zum Abschauen: `examples/minimal/bausteine/flankenzaehler/`.
## Faehigkeiten: was ein Baustein darf (ADR-0014 V-1)

Ein Baustein aus fremder Hand laeuft im Prozess, der das Haus steuert. Was er
darf, steht deshalb im Manifest — nicht im Code, wo es sich jeder selbst geben
koennte:

```yaml
capabilities:
  netz:
    hosts: [api.telegram.org]   # exakt diese Hosts, nur https
  zustand: true                 # ctx.zustand (Default true)
  timer: true                   # ctx.planeTimer/brichAb (Default true)
```

**Ohne `netz`-Block gibt es keinen Netzzugriff.** Fehlt der `capabilities`-Block
ganz, laeuft der Baustein weiter (Bestandsschutz) — aber ebenfalls ohne Netz.
Netz ist nie implizit.

`fachwerk validate` und der Monitor zeigen die Faehigkeiten an, bevor jemand den
Baustein benutzt. Das ist der halbe Schutz: sichtbar machen, wer ins Netz will
und wohin.

## Netzzugriff: nur ueber ctx.netz (ADR-0014 V-2)

Bausteine bekommen **kein `fetch`**. Sie sagen der Engine, was sie wollen; die
prueft gegen die Allowlist und fuehrt es aus. Der Aufruf kehrt sofort zurueck —
die Graph-Auswertung bleibt synchron. Die Antwort kommt als **eigene Kaskade**
mit dem Auslöser `netz` zurueck, genau wie ein Timer:

```js
export default function rechne(eingaenge, ctx) {
  // Antwort auf einen frueheren Auftrag?
  if (ctx.ausloeser.art === "netz") {
    return { gesendet: ctx.ausloeser.ok, fehler: ctx.ausloeser.fehler ?? "" };
  }
  if (eingaenge.ausloeser !== true) return null;

  ctx.netz.hole("sende-1", "https://api.telegram.org/bot<token>/sendMessage", {
    methode: "POST",
    kopfzeilen: { "content-type": "application/json" },
    koerper: JSON.stringify({ chat_id: "4711", text: "Alarm" }),
  });
  return null;   // Ergebnis kommt oben an, nicht hier
}
```

Der Auslöser `netz` traegt `id` (deine Kennung), `ok`, `status`, `text` und bei
Transportfehlern `fehler`. Die Engine erzwingt Timeout (10 s), Groessenlimit
(256 KB) und lehnt Umleitungen ab — eine Umleitung koennte aus der Allowlist
herausfuehren.

Vollstaendiges Beispiel: `examples/bausteine-telegram/`.

## Was gesperrt ist — und wie ehrlich der Schutz ist

Beim Laden abgelehnt (statischer Check): `fetch(`, `import`/`require`,
`node:`-Module, `process`, `globalThis`, `eval`, `Function(`. Zusaetzlich sind
`fetch`, `WebSocket`, `XMLHttpRequest` und `EventSource` im Baustein-Scope zur
Laufzeit gesperrt — wer am statischen Check vorbeikommt, scheitert dort.

**Die Grenze ehrlich benannt:** Das faengt Unfaelle und triviale Bosheit. Es ist
KEIN Schutz gegen einen entschlossenen Angreifer — ein Node-Worker ist keine
Sicherheitsgrenze. Die harte Isolation (eigener Prozess mit Permission-Model
oder WASM) ist ADR-0014 V-4 und aendert an diesem SDK nichts: weil I/O
ausschliesslich ueber ctx-Dienste laeuft, ist der Unterbau austauschbar, ohne
ein Manifest oder eine Zeile Baustein-Code anzufassen.

Wer Bausteine aus fremder Quelle einsetzt, sollte sie lesen — so wie man ein
Shell-Skript aus dem Internet liest, bevor man es ausfuehrt.

## Beispiel: Wetter (zyklischer Abruf)

Das Wetter-Beispiel (`examples/bausteine-wetter/`) zeigt den zyklischen Abruf per Timer und den Umgang mit strukturierten Array-Daten (Tagesvorhersagen). Es veranschaulicht ausserdem konfig-variable Ports in der Ausgabe (z. B. `tag1_max`, `tag2_max` abhaengig vom Parameter `tage`).

**Tipp zur Visu:** Die WMO-Wettercodes (`wettercode`) der Open-Meteo API (0-99) koennen in der Visu-Konfiguration ueber eine `enum_map` lesbar gemacht werden:

```yaml
enum_map:
  0: "Klar"
  1: "Heiter"
  2: "Wolkig"
  3: "Bedeckt"
  # ... weitere Codes ...
```
