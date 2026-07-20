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

## Beispiel: Telegram

`examples/bausteine-telegram` zeigt Templates (`{wert}`), Filter (`nur_bei`) und —
wichtiger — wie ein Baustein **Netzwerk** benutzt, obwohl die Sandbox synchron rechnet.

**Die Regel:** `rechne` darf **nie** ein Promise zurückgeben. Der Aufruf läuft synchron
über einen `SharedArrayBuffer`; ein Promise als Rückgabewert erzeugt einen
`DataCloneError` und reißt den Baustein mit. Auch `ctx.zustand` hilft nicht weiter:
was dort **nach** dem Rücksprung hineingeschrieben wird, überträgt niemand mehr.

**Das Muster** (fire-and-forget mit nachlaufendem Ergebnis):

```js
let letzterErfolg = false;          // Modul-Zustand — überlebt zwischen Aufrufen
let letzterFehler = "";

export default function rechne(eingaenge, ctx) {
  const ausgabe = { gesendet: letzterErfolg, fehler: letzterFehler };  // Stand VOR diesem Aufruf
  fetch(url, { signal: AbortSignal.timeout(10_000) })
    .then((r) => { letzterErfolg = r.ok; letzterFehler = r.ok ? "" : `HTTP ${r.status}`; })
    .catch((e) => { letzterErfolg = false; letzterFehler = e.message; });
  return ausgabe;                    // synchron zurück; der Versand läuft im Hintergrund weiter
}
```

Der Worker-Event-Loop führt das `fetch` nach dem Rücksprung zu Ende, und **Variablen auf
Modulebene überleben zwischen Aufrufen** (dafür also nicht `ctx.zustand` nehmen). Das
Ergebnis landet deshalb erst bei der **nächsten Auslösung** auf den Ausgängen.

**Drei Konsequenzen, die man kennen muss:**

- Die Ausgänge laufen dem Versand um eine Auslösung nach. Schreib das in die
  `beschreibung` des Manifests — wer `gesendet` liest, muss wissen, worauf es sich bezieht.
- **Nie synchron Erfolg behaupten.** Ein `gesendet: true`, ohne dass etwas gesendet wurde,
  ist schlimmer als gar kein Baustein: bei einer Alarmmeldung quittiert es eine
  Zustellung, die nie stattfand.
- Der Netzwerkpfad ist mit Manifest-Testvektoren **nicht deterministisch prüfbar**, weil
  das Ergebnis erst im Folgeaufruf ankommt. Decke mit Vektoren die reine Logik ab und
  prüfe den Versand von Hand — statt einen Vektor zu bauen, der zufällig grün ist.

Fire-and-forget umgeht das Zeitlimit der Sandbox (100 ms je Aufruf): der Aufruf kehrt
sofort zurück, die Netzwerkarbeit läuft ungebremst weiter. Ob Bausteine aus fremder Hand
das dürfen, ist eine offene Policy-Frage zu ADR-0008.
