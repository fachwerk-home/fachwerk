#!/usr/bin/env bash
# End-zu-End-Akzeptanztest des Walking Skeleton (S-6):
#   Injektion auf 1/0/1  ⇒  Fachwerk-Kaskade (NOT)  ⇒  Telegramm auf 1/0/2.
# Läuft lokal wie in CI: kompletter Stack via Docker Compose.
set -euo pipefail
cd "$(dirname "$0")/.."

aufraeumen() { docker compose down --remove-orphans >/dev/null 2>&1 || true; }
trap aufraeumen EXIT

docker compose up -d --build bus-simulator fachwerk

sim() { docker compose exec -T bus-simulator python simctl.py 127.0.0.1 "$@"; }

# Warten, bis der Tunnel steht (fachwerk verbindet mit Wiederholung)
for i in $(seq 1 30); do
  if sim ping 2>/dev/null | grep -q '"conns": [1-9]'; then break; fi
  [ "$i" = 30 ] && { echo "FAIL: kein Tunnel nach 30s"; docker compose logs fachwerk; exit 1; }
  sleep 1
done
echo "Tunnel steht."

sim events_clear >/dev/null
sim send 1/0/1 1 >/dev/null
echo "Injiziert: 1/0/1 = 1"

# Erwartung: Fachwerk schreibt NOT(1)=0 auf 1/0/2
for i in $(seq 1 20); do
  if sim events -n 50 | grep '"ev": "rx"' | grep '"ga": "1/0/2"' | grep -q '"value": 0'; then
    echo "OK: Telegramm 1/0/2 = 0 empfangen — Faden geschlossen."
    echo "--- Fachwerk-Trace (stdout) ---"
    docker compose logs --no-log-prefix fachwerk | grep '"schritte"' | tail -2 || true
    exit 0
  fi
  sleep 0.5
done

echo "FAIL: kein Telegramm auf 1/0/2 innerhalb 10s"
echo "--- Simulator-Events ---"; sim events -n 50 || true
echo "--- Fachwerk-Logs ---"; docker compose logs fachwerk || true
exit 1
