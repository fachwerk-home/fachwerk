#!/usr/bin/env bash
# E2E des Beobachtungsmodus (risikofrei am echten Bus):
# Fachwerk empfängt Telegramme und rechnet die Logik, sendet aber NIE zurück.
# Beweis: Licht an → Fachwerk loggt „würde senden 6/1/200" — aber der Bus
# (Simulator) empfängt KEIN Telegramm auf 6/1/200.
set -euo pipefail
cd "$(dirname "$0")/.."

export MSYS_NO_PATHCONV=1
export FACHWERK_GEWERK=/gewerke/abnahme-licht-status

aufraeumen() { docker compose down --remove-orphans --volumes >/dev/null 2>&1 || true; }
trap aufraeumen EXIT

# Fachwerk im Beobachtungsmodus starten.
FACHWERK_KNX_MODUS=beobachten docker compose up -d --build bus-simulator fachwerk
sim() { docker compose exec -T bus-simulator python simctl.py 127.0.0.1 "$@"; }

for i in $(seq 1 30); do
  sim ping 2>/dev/null | grep -qE '"conns": [1-9]' && break
  [ "$i" = 30 ] && { echo "FAIL: kein Tunnel"; docker compose logs fachwerk; exit 1; }
  sleep 1
done
echo "Tunnel steht (Beobachtungsmodus)."

sim events_clear >/dev/null
sim send 6/1/83 1 >/dev/null   # Küche Spots an
echo "Injiziert: 6/1/83 = 1 (ein Licht an)"

# 1) Fachwerk MUSS es empfangen und die Logik rechnen (Dry-Run auf 6/1/200 = true).
gefunden=0
for i in $(seq 1 20); do
  if docker compose logs --no-log-prefix fachwerk 2>/dev/null | grep -q "senden  6/1/200 = true"; then
    gefunden=1; break
  fi
  sleep 0.5
done
[ "$gefunden" = 1 ] || { echo "FAIL: Logik hat 6/1/200 nicht als Dry-Run gemeldet"; docker compose logs fachwerk | tail -20; exit 1; }
echo "OK: Logik gerechnet — wuerde 6/1/200 = true senden."

# 2) Der Bus darf KEIN Telegramm auf 6/1/200 gesehen haben (nichts gesendet!).
if sim events -n 80 | grep '"ga": "6/1/200"' | grep -q '"ev": "rx"'; then
  echo "FAIL: Bus hat ein Telegramm auf 6/1/200 empfangen — es wurde gesendet!"
  sim events -n 80 | grep "6/1/200"
  exit 1
fi
echo "OK: Bus hat auf 6/1/200 NICHTS empfangen — Beobachtungsmodus hält dicht."
echo "OK: Beobachtungsmodus bestanden — empfaengt und rechnet, sendet garantiert nicht."
