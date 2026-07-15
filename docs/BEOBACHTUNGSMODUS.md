# Beobachtungsmodus — Fachwerk am echten Bus, risikofrei

Der Beobachtungsmodus lässt Fachwerk die **echten** KNX-Telegramme empfangen und die
importierte Logik darauf rechnen — aber **niemals senden**. So sieht man live, was die
Anlage tut und was Fachwerks Logik täte, ohne jedes Risiko für die laufende Installation.

## Was er tut

- **Empfängt** alle Gruppentelegramme über den KNXnet/IP-Tunnel (passiv).
- **Rechnet** die Logik-Kaskaden auf echten Werten (Traces wie immer).
- **Sendet NIE.** `sende()` überträgt nichts, sondern meldet nur als Dry-Run, *was* gesendet
  würde. Doppelt abgesichert: Treiber-Flag + Nichtübertragung im Sendepfad.

Ausgabe (stderr):
```
== BEOBACHTUNGSMODUS == empfange Bustelegramme, sende NIE.
RX  6/1/83 = true  → eg.kueche_spots        # vom Bus empfangen
[BEOBACHTUNG] würde senden  6/1/200 = true   # was die Logik täte (nicht gesendet)
```
Die vollständigen Ausführungs-Traces (JSONL) laufen wie gewohnt nach stdout.

## Am echten Bus starten

Vorausgesetzt: ein erreichbares KNXnet/IP-Interface/-Router (Tunneling). Kein
Port-Forwarding nötig — Fachwerk läuft im selben Netz.

```bash
# Direkt (lokal):
FACHWERK_KNX_HOST=<ip-des-knx-interface> \
FACHWERK_KNX_PORT=3671 \
FACHWERK_KNX_MODUS=beobachten \
  node cli/src/main.ts run <gewerk-verzeichnis>

# Oder via Compose (Host-IP des Interface eintragen):
FACHWERK_KNX_MODUS=beobachten FACHWERK_KNX_HOST=<ip> docker compose up fachwerk
```

`FACHWERK_KNX_MODUS` leer/ungesetzt = normaler Betrieb (sendet). Nur der exakte Wert
`beobachten` aktiviert den Nur-Lese-Modus.

## Grenzen (ehrlich)

- **Nur Konsole/Traces**, noch kein Dashboard — die sichtbare Rückmeldung ist Log/Trace.
  Ein Web-Status/Visu kommt später (ADR-0009 / Phase 5).
- Datenpunkte ohne bekannten Wert (noch kein Telegramm gesehen) tragen erst ab dem ersten
  Empfang einen Wert (ADR-0005: letzter bekannter Wert).
- Beobachtungsmodus ändert nichts an der Anlage — er ist ausdrücklich zum Zuschauen da.
