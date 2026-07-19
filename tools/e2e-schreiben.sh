#!/usr/bin/env bash
# E2E des Schreibpfads (P5-8) gegen den vollen Stack — die drei Verriegelungen
# werden hier NICHT simuliert, sondern am laufenden System bewiesen:
#   1. ohne Token: 401 (Transport) bzw. 403 (Schreibpfad aus)
#   2. mit Token im Normalmodus: POST -> echtes Telegramm am Simulator
#   3. protected: 403, und der Wert bewegt sich nicht
#   4. Beobachtungsmodus: POST wird angenommen, aber NICHTS geht auf den Bus
#   5. audit.jsonl waechst append-only und enthaelt auch die Ablehnungen
set -euo pipefail
cd "$(dirname "$0")/.."

export MSYS_NO_PATHCONV=1
export FACHWERK_GEWERK=/gewerke/minimal
export FACHWERK_API_TOKEN=e2e-testtoken
BASIS="http://localhost:8300"
AUTH="Authorization: Bearer $FACHWERK_API_TOKEN"

aufraeumen() { docker compose down --remove-orphans --volumes >/dev/null 2>&1 || true; }
trap aufraeumen EXIT

sim() { docker compose exec -T bus-simulator python simctl.py 127.0.0.1 "$@"; }

warte_api() {
  # MIT Token pollen: bei gesetztem FACHWERK_API_TOKEN ist auch /api/status
  # tokenpflichtig — ein nacktes GET liefert korrekt 401, nicht „noch nicht da".
  for i in $(seq 1 40); do
    if curl -sf -H "$AUTH" "$BASIS/api/status" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "FAIL: API antwortet nicht"; docker compose logs fachwerk | tail -20; exit 1
}

warte_tunnel() {
  for i in $(seq 1 30); do
    if sim ping 2>/dev/null | grep -qE '"conns": [1-9]'; then return 0; fi
    sleep 1
  done
  echo "FAIL: kein Tunnel"; docker compose logs fachwerk; exit 1
}

code() { curl -s -o /dev/null -w "%{http_code}" "$@" || true; }
audit_zeilen() {
  docker compose exec -T fachwerk sh -c 'wc -l < /daten/audit.jsonl 2>/dev/null || echo 0' \
    | tr -d '[:space:]'
}

docker compose up -d --build bus-simulator fachwerk
warte_api
warte_tunnel

# --- 1) Ohne Token kommt man nicht einmal an den Handler -----------------------
ohne=$(code -X POST -H "content-type: application/json" -d '{"wert":true}' \
  "$BASIS/api/datenpunkte/wohnen.licht")
[ "$ohne" = "401" ] || { echo "FAIL: ohne Token kam $ohne statt 401"; exit 1; }
echo "OK: ohne Token 401."

# --- 2) Mit Token im Normalmodus: der Bus sieht das Telegramm ------------------
sim events_clear >/dev/null
antwort=$(curl -s -X POST -H "$AUTH" -H "content-type: application/json" \
  -d '{"wert":true}' "$BASIS/api/datenpunkte/wohnen.licht")
echo "$antwort" | grep -q '"angenommen":true' || {
  echo "FAIL: POST nicht angenommen: $antwort"; exit 1; }
echo "$antwort" | grep -q '"hinweis"' && {
  echo "FAIL: Normalmodus darf keinen Beobachten-Hinweis liefern: $antwort"; exit 1; }

for i in $(seq 1 20); do
  if sim events -n 50 | grep '"ev": "rx"' | grep '"ga": "1/0/2"' | grep -q '"value": 1'; then
    echo "OK: POST erzeugte ein echtes Telegramm auf 1/0/2."
    break
  fi
  [ "$i" = 20 ] && { echo "FAIL: kein Telegramm nach POST"; sim events -n 50; exit 1; }
  sleep 0.5
done

# --- 3) protected bleibt zu ----------------------------------------------------
pcode=$(code -X POST -H "$AUTH" -H "content-type: application/json" -d '{"wert":true}' \
  "$BASIS/api/datenpunkte/wohnen.tuer")
[ "$pcode" = "403" ] || { echo "FAIL: protected lieferte $pcode statt 403"; exit 1; }
curl -s -H "$AUTH" "$BASIS/api/datenpunkte/wohnen.tuer" | grep -q '"wert":null' || {
  echo "FAIL: protected-Datenpunkt hat sich bewegt"
  curl -s -H "$AUTH" "$BASIS/api/datenpunkte/wohnen.tuer"; exit 1; }
echo "OK: protected 403 und Wert unveraendert."

# --- 4) Typverstoss ------------------------------------------------------------
tcode=$(code -X POST -H "$AUTH" -H "content-type: application/json" -d '{"wert":"an"}' \
  "$BASIS/api/datenpunkte/wohnen.licht")
[ "$tcode" = "422" ] || { echo "FAIL: Typverstoss lieferte $tcode statt 422"; exit 1; }
echo "OK: Typverstoss 422."

vor_umschalten=$(audit_zeilen)

# --- 5) Beobachtungsmodus: angenommen, aber garantiert nichts auf dem Bus ------
FACHWERK_KNX_MODUS=beobachten docker compose up -d --force-recreate fachwerk >/dev/null
warte_api
warte_tunnel
sim events_clear >/dev/null

beo=$(curl -s -X POST -H "$AUTH" -H "content-type: application/json" \
  -d '{"wert":false}' "$BASIS/api/datenpunkte/wohnen.licht")
echo "$beo" | grep -q '"angenommen":true' || { echo "FAIL: $beo"; exit 1; }
echo "$beo" | grep -q 'nicht auf den Bus gesendet' || {
  echo "FAIL: Antwort verschweigt den Beobachtungsmodus: $beo"; exit 1; }

sleep 3
if sim events -n 50 | grep '"ev": "rx"' | grep -q '"ga": "1/0/2"'; then
  echo "FAIL: im Beobachtungsmodus ging ein Telegramm auf den Bus (Regelbruch!)"
  sim events -n 50
  exit 1
fi
echo "OK: Beobachtungsmodus nahm den Wert an und sendete NICHTS."

# --- 6) Audit: waechst ueber den Neustart hinweg und kennt die Ablehnungen -----
nach=$(audit_zeilen)
[ "${nach:-0}" -gt "${vor_umschalten:-0}" ] || {
  echo "FAIL: Audit ist nicht gewachsen ($vor_umschalten -> $nach)"; exit 1; }
docker compose exec -T fachwerk grep -q '"angenommen":false' /daten/audit.jsonl || {
  echo "FAIL: abgelehnte Versuche stehen nicht im Audit"
  docker compose exec -T fachwerk cat /daten/audit.jsonl; exit 1; }
docker compose exec -T fachwerk grep -q '"schluessel":"wohnen.tuer"' /daten/audit.jsonl || {
  echo "FAIL: der protected-Versuch fehlt im Audit"; exit 1; }
echo "OK: audit.jsonl waechst ($vor_umschalten -> $nach) und enthaelt die Ablehnungen."

echo "OK: Schreibpfad-E2E bestanden."
