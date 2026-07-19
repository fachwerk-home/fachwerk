#!/usr/bin/env bash
# E2E der Archive (P5-13a/13b) gegen den vollen Stack:
#   1. /api/status und /api/archive kennen das deklarierte Archiv
#   2. Telegramm am Simulator -> Zaehler aendert sich -> Punkt in der Zeitreihe
#   3. Container-Neustart -> die Punkte sind noch da (Volume, ADR-0006)
set -euo pipefail
cd "$(dirname "$0")/.."

# Git-Bash (Windows) wuerde /gewerke/... sonst in einen Windows-Pfad umschreiben.
export MSYS_NO_PATHCONV=1
export FACHWERK_GEWERK=/gewerke/minimal
BASIS="http://localhost:8300"

aufraeumen() { docker compose down --remove-orphans --volumes >/dev/null 2>&1 || true; }
trap aufraeumen EXIT

docker compose up -d --build bus-simulator fachwerk

sim() { docker compose exec -T bus-simulator python simctl.py 127.0.0.1 "$@"; }

warte_api() {
  for i in $(seq 1 40); do
    if curl -sf "$BASIS/api/status" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "FAIL: API antwortet nicht"; docker compose logs fachwerk | tail -20; exit 1
}

# Anzahl Rohpunkte im Archiv (rasterS=0 = keine Rasterung, exakte Zaehlung).
punkte() {
  curl -s "$BASIS/api/archive/schaltzaehler?rasterS=0" \
    | sed -E 's/.*"anzahl":([0-9]+).*/\1/'
}

warte_api
echo "API antwortet."

# 1) Das Archiv aus archiv/klima.yaml ist geladen und sichtbar
curl -s "$BASIS/api/status" | grep -q '"archive":{"anzahl":1}' || {
  echo "FAIL: /api/status meldet kein Archiv"; curl -s "$BASIS/api/status"; exit 1; }
curl -s "$BASIS/api/archive" | grep -q '"id":"schaltzaehler"' || {
  echo "FAIL: /api/archive listet das Archiv nicht"; curl -s "$BASIS/api/archive"; exit 1; }
echo "OK: Archiv ist in /api/status und /api/archive sichtbar."

# 2) Tunnel abwarten, dann eine Flanke auf den Taster geben
for i in $(seq 1 30); do
  if sim ping 2>/dev/null | grep -qE '"conns": [1-9]'; then break; fi
  [ "$i" = 30 ] && { echo "FAIL: kein Tunnel"; docker compose logs fachwerk; exit 1; }
  sleep 1
done
sim send 1/0/1 1 >/dev/null
echo "Injiziert: 1/0/1 = 1 (Flankenzaehler erhoeht wohnen.zaehler)"

for i in $(seq 1 20); do
  n=$(punkte)
  if [ "${n:-0}" -ge 1 ] 2>/dev/null; then
    echo "OK: Wertaenderung liegt als Punkt im Archiv ($n)."
    break
  fi
  [ "$i" = 20 ] && {
    echo "FAIL: kein Punkt im Archiv"
    curl -s "$BASIS/api/archive/schaltzaehler?rasterS=0"
    docker compose logs fachwerk | tail -20
    exit 1
  }
  sleep 1
done
vorher=$(punkte)

# 3) Neustart: die Zeitreihe liegt auf dem Volume, nicht im Container
docker compose restart -t 5 fachwerk >/dev/null
echo "Fachwerk neu gestartet — Punkte muessen den Neustart ueberleben."
warte_api

nachher=$(punkte)
if [ "${nachher:-0}" -lt "$vorher" ]; then
  echo "FAIL: nach dem Neustart nur noch $nachher statt $vorher Punkt(e)"
  curl -s "$BASIS/api/archive/schaltzaehler?rasterS=0"
  exit 1
fi
echo "OK: $nachher Punkt(e) nach dem Neustart — Zeitreihe ueberlebt (ADR-0006)."

echo "OK: Archiv-E2E bestanden."
