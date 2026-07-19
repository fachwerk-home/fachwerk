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

Ein einfaches Beispiel für einen Telegram-Nachrichtenversand (`examples/bausteine-telegram`) zeigt, wie man Templates (`{wert}`) und einfache Filter (`nur_bei`) in der Sandbox verarbeitet. 

**Wichtig:** Da die Sandbox streng synchron arbeitet, ist ein echter asynchroner `fetch()`-Aufruf, der sein Ergebnis (z. B. Erfolg/Fehler) auf die Baustein-Ausgänge legt, aktuell nicht möglich. Ein solches Netzwerk-Feature für Dienste-Bausteine wird gemäß ADR-0008 separat konzipiert.
