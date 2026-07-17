#!/usr/bin/env bash
# E2E des MQTT-Treibers gegen einen ECHTEN Broker (Mosquitto):
# mosquitto_pub fachwerk/taster=1 → Fachwerk-Kaskade (NOT) → fachwerk/licht=0,
# beobachtet mit mosquitto_sub. Beweist Interop jenseits des Mock-Brokers.
set -euo pipefail
cd "$(dirname "$0")/.."

export MSYS_NO_PATHCONV=1

aufraeumen() {
  docker compose -f docker-compose.yml -f tools/compose-mqtt-test.yml down --remove-orphans --volumes >/dev/null 2>&1 || true
}
trap aufraeumen EXIT

dc() { docker compose -f docker-compose.yml -f tools/compose-mqtt-test.yml "$@"; }

FACHWERK_GEWERK=/app/examples/mqtt-demo dc up -d --build bus-simulator mqtt-broker fachwerk

# Warten bis Fachwerk MQTT verbunden meldet
for i in $(seq 1 30); do
  if dc logs --no-log-prefix fachwerk 2>/dev/null | grep -q "MQTT verbunden"; then break; fi
  [ "$i" = 30 ] && { echo "FAIL: MQTT nicht verbunden"; dc logs fachwerk | tail -20; exit 1; }
  sleep 1
done
echo "MQTT verbunden."

# Abonnent auf fachwerk/licht starten (schreibt empfangene Nachricht in Datei)
dc exec -T mqtt-broker sh -c "mosquitto_sub -t fachwerk/licht -C 1 > /tmp/licht.txt 2>/dev/null &"
sleep 1
dc exec -T mqtt-broker mosquitto_pub -t fachwerk/taster -m "1"
echo "Publiziert: fachwerk/taster = 1"

for i in $(seq 1 20); do
  wert=$(dc exec -T mqtt-broker cat /tmp/licht.txt 2>/dev/null || true)
  if [ "$wert" = "0" ]; then
    echo "OK: fachwerk/licht = 0 empfangen — MQTT-Rundlauf (Broker→Logik→Broker) steht."
    exit 0
  fi
  sleep 0.5
done

echo "FAIL: kein fachwerk/licht=0 innerhalb 10s"
dc logs --no-log-prefix fachwerk | tail -15
exit 1
