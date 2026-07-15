#!/usr/bin/env bash
# E2E-Test der Neustart-Regel (SPEC-002 T-5, ADR-0005 E-8 „nicht verhandelbar"):
# Treppenlicht an → Fachwerk-Container-Neustart mitten in der Laufzeit →
# das Licht geht TROTZDEM aus (Timer persistiert; kein hängendes Dauer-An).
set -euo pipefail
cd "$(dirname "$0")/.."

# Git-Bash (Windows) würde /gewerke/... sonst in einen Windows-Pfad umschreiben.
export MSYS_NO_PATHCONV=1
export FACHWERK_GEWERK=/gewerke/treppenlicht

aufraeumen() {
  docker compose down --remove-orphans --volumes >/dev/null 2>&1 || true
}
trap aufraeumen EXIT

docker compose up -d --build bus-simulator fachwerk

sim() { docker compose exec -T bus-simulator python simctl.py 127.0.0.1 "$@"; }

warte_tunnel() {
  for i in $(seq 1 30); do
    if sim ping 2>/dev/null | grep -qE '"conns": [1-9]'; then return 0; fi
    sleep 1
  done
  echo "FAIL: kein Tunnel"; docker compose logs fachwerk; exit 1
}

warte_tunnel
sim events_clear >/dev/null
sim send 1/0/3 1 >/dev/null
echo "Impuls gesendet: 1/0/3 = 1"

# Licht muss angehen
for i in $(seq 1 20); do
  if sim events -n 50 | grep '"ev": "rx"' | grep '"ga": "1/0/4"' | grep -q '"value": 1'; then
    echo "Licht ist an (1/0/4 = 1). Starte Fachwerk-Container neu …"
    break
  fi
  [ "$i" = 20 ] && { echo "FAIL: Licht ging nicht an"; sim events -n 50; exit 1; }
  sleep 0.5
done

sleep 2
docker compose restart -t 5 fachwerk >/dev/null
echo "Neustart ausgelöst (Timer lief noch ~13 s)."
sim events_clear >/dev/null

# Nach dem Neustart MUSS das Aus-Telegramm kommen (fortgesetzter Timer).
for i in $(seq 1 60); do
  if sim events -n 50 | grep '"ev": "rx"' | grep '"ga": "1/0/4"' | grep -q '"value": 0'; then
    echo "OK: Licht ging nach dem Neustart aus — kein hängender Ausgang (T-5 bewiesen)."
    docker compose logs --no-log-prefix fachwerk 2>/dev/null | grep -E "Persistenz|nachgeholt" | tail -3 || true
    exit 0
  fi
  sleep 1
done

echo "FAIL: Licht blieb nach Neustart an — T-5 verletzt"
echo "--- Simulator-Events ---"; sim events -n 50 || true
echo "--- Fachwerk-Logs ---"; docker compose logs fachwerk || true
exit 1
