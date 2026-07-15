#!/usr/bin/env bash
# Abnahme-E2E einer echten, aus EDOMI importierten Logikseite („Licht Status"):
# 7 Licht-Status-GAs → ODER-8 → Sammelmeldung 6/1/200.
# Erwartung: Sammelmeldung = 1, sobald irgendein Licht an ist; 0, wenn alle aus.
set -euo pipefail
cd "$(dirname "$0")/.."

export MSYS_NO_PATHCONV=1
export FACHWERK_GEWERK=/gewerke/abnahme-licht-status

aufraeumen() { docker compose down --remove-orphans --volumes >/dev/null 2>&1 || true; }
trap aufraeumen EXIT

docker compose up -d --build bus-simulator fachwerk
sim() { docker compose exec -T bus-simulator python simctl.py 127.0.0.1 "$@"; }

for i in $(seq 1 30); do
  sim ping 2>/dev/null | grep -qE '"conns": [1-9]' && break
  [ "$i" = 30 ] && { echo "FAIL: kein Tunnel"; docker compose logs fachwerk; exit 1; }
  sleep 1
done
echo "Tunnel steht."

# Prüft, dass auf 6/1/200 zuletzt der erwartete Wert gesendet wurde.
erwarte_status() {
  local soll="$1" text="$2"
  for i in $(seq 1 20); do
    letzter=$(sim events -n 80 | grep '"ev": "rx"' | grep '"ga": "6/1/200"' | tail -1 || true)
    if echo "$letzter" | grep -q "\"value\": $soll"; then
      echo "  OK: $text → Sammelmeldung = $soll"
      return 0
    fi
    sleep 0.3
  done
  echo "  FAIL: $text → erwartet $soll, zuletzt: ${letzter:-<nichts>}"
  sim events -n 80 | grep '6/1/200' || true
  exit 1
}

# 1) Alle Lichter aus → Sammelmeldung 0
sim events_clear >/dev/null
for ga in 6/1/134 7/1/13 6/1/144 7/1/3 6/1/3 6/1/124 6/1/83; do sim send "$ga" 0 >/dev/null; done
erwarte_status 0 "alle 7 Lichter aus"

# 2) Ein Licht an (Küche Spots) → Sammelmeldung 1
sim send 6/1/83 1 >/dev/null
erwarte_status 1 "Küche Spots an"

# 3) Zweites Licht an, erstes bleibt → weiterhin 1
sim send 6/1/3 1 >/dev/null
erwarte_status 1 "Lichtvoute zusätzlich an"

# 4) Beide wieder aus → Sammelmeldung 0
sim send 6/1/83 0 >/dev/null
sim send 6/1/3 0 >/dev/null
erwarte_status 0 "alle wieder aus"

echo "OK: Abnahme Licht Status bestanden - importierte Logik laeuft gegen den Bus."
