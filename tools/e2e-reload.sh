#!/usr/bin/env bash
# E2E des Gewerk-Reloads (P5-10a) gegen den vollen Stack. Geprueft wird nicht,
# ob die API 200 sagt, sondern ob die Anlage sich richtig verhaelt:
#   1. Reload im laufenden Betrieb: neue Logik greift, KNX-Tunnel bleibt bestehen
#   2. kaputtes Gewerk: Reload wird abgelehnt, die ALTE Logik steuert weiter
#   3. laufender Timer ueberlebt den Reload (T-5 — kein haengender Ausgang)
#   4. Beobachtungsmodus ueberlebt den Reload (heilig: sendet danach immer noch nie)
set -euo pipefail
cd "$(dirname "$0")/.."

export MSYS_NO_PATHCONV=1
export FACHWERK_API_TOKEN=e2e-reload-token
# Editor-Rechte muss man ausdruecklich vergeben (P5-12): der Default des
# statischen Tokens ist read,operate — damit kaeme dieser Test korrekt nicht
# durch. Genau das prueft tools/e2e-auth.sh von der anderen Seite.
export FACHWERK_API_TOKEN_SCOPES=read,operate,write:gewerk,activate:dev
BASIS="http://localhost:8300"
AUTH="Authorization: Bearer $FACHWERK_API_TOKEN"
COMPOSE="docker compose -f docker-compose.yml -f tools/compose-reload-test.yml"
GEWERK=tmp/e2e-gewerk

aufraeumen() {
  $COMPOSE down --remove-orphans --volumes >/dev/null 2>&1 || true
  rm -rf "$GEWERK"
}
trap aufraeumen EXIT

# Wegwerf-Gewerk aufbauen (Treppenlicht: hat einen Timer, den wir brauchen).
rm -rf "$GEWERK"
mkdir -p "$GEWERK"
cp -r examples/treppenlicht/. "$GEWERK/"
# Der Container laeuft als Nutzer node (uid 1000); auf Linux-Runnern gehoert
# das Verzeichnis dem Runner-Nutzer. Ohne Schreibrecht scheitert die Editor-API,
# und zwar NUR in CI: Docker Desktop unter Windows ignoriert Unix-Rechte.
chmod -R 0777 "$GEWERK"

sim() { $COMPOSE exec -T bus-simulator python simctl.py 127.0.0.1 "$@"; }
post() { curl -s -X POST -H "$AUTH" -H "content-type: application/json" -d "$2" "$BASIS$1"; }
# Eine Datei zu schreiben ist ein Testschritt, kein Nebengeraeusch: wer die
# Antwort verwirft, sucht den Fehler drei Schritte spaeter an der falschen Stelle.
schreibe() {
  local antwort
  antwort=$(post /api/gewerk/dateien "$1")
  echo "$antwort" | grep -q '"angenommen":true' || {
    echo "FAIL: Gewerk-Datei nicht geschrieben: $antwort"; exit 1; }
}

warte_api() {
  for i in $(seq 1 40); do
    if curl -sf -H "$AUTH" "$BASIS/api/status" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "FAIL: API antwortet nicht"; $COMPOSE logs fachwerk | tail -20; exit 1
}
warte_tunnel() {
  for i in $(seq 1 30); do
    if sim ping 2>/dev/null | grep -qE '"conns": [1-9]'; then return 0; fi
    sleep 1
  done
  echo "FAIL: kein Tunnel"; $COMPOSE logs fachwerk; exit 1
}

$COMPOSE up -d --build bus-simulator fachwerk
warte_api
warte_tunnel
kanal_vorher=$(curl -s -H "$AUTH" "$BASIS/api/status" | sed -E 's/.*"kanal":([0-9]+).*/\1/')

# --- 1) Reload im laufenden Betrieb -------------------------------------------
# Neue Logikseite dazu: ein zweites Licht, das dem Impuls direkt folgt.
schreibe '{"pfad":"datenpunkte/flur.yaml","inhalt":"impuls:\n  name: Treppenlicht Impuls\n  klasse: bus\n  typ: bool\n  treiber: knx\n  adresse: 1/0/3\nlicht:\n  name: Treppenlicht\n  klasse: bus\n  typ: bool\n  treiber: knx\n  adresse: 1/0/4\nzweit:\n  name: Zweitlicht\n  klasse: bus\n  typ: bool\n  treiber: knx\n  adresse: 1/0/9\n"}'
schreibe '{"pfad":"logik/zweit.yaml","inhalt":"knoten:\n  n1:\n    baustein: NOT\nkanten:\n  - von: dp:flur.impuls\n    nach: n1.in\n  - von: n1.out\n    nach: dp:flur.zweit\n"}'

antwort=$(post /api/gewerk/aktivieren '{}')
echo "$antwort" | grep -q '"angenommen":true' || { echo "FAIL: Reload abgelehnt: $antwort"; exit 1; }
dauer=$(echo "$antwort" | sed -E 's/.*"dauerMs":([0-9]+).*/\1/')
[ "${dauer:-9999}" -lt 2000 ] || { echo "FAIL: Reload dauerte ${dauer} ms (> 2000)"; exit 1; }
echo "OK: Reload angenommen in ${dauer} ms."

# Der KNX-Tunnel darf dabei NICHT neu aufgebaut worden sein.
kanal_nachher=$(curl -s -H "$AUTH" "$BASIS/api/status" | sed -E 's/.*"kanal":([0-9]+).*/\1/')
[ "$kanal_vorher" = "$kanal_nachher" ] || {
  echo "FAIL: KNX-Tunnel wurde neu aufgebaut ($kanal_vorher -> $kanal_nachher)"; exit 1; }
curl -s -H "$AUTH" "$BASIS/api/status" | grep -q '"knx":{"verbunden":true' || {
  echo "FAIL: KNX nach Reload nicht verbunden"; exit 1; }

# Die NEUE Logik muss greifen: Impuls erzeugt jetzt zusaetzlich 1/0/9.
sim events_clear >/dev/null
sim send 1/0/3 1 >/dev/null
neu_da=nein
for i in $(seq 1 20); do
  if sim events -n 60 | grep '"ev": "rx"' | grep -q '"ga": "1/0/9"'; then neu_da=ja; break; fi
  sleep 0.5
done
[ "$neu_da" = ja ] || { echo "FAIL: neue Logik greift nicht"; sim events -n 60; exit 1; }
echo "OK: neue Logik aktiv, KNX-Tunnel (Kanal $kanal_nachher) blieb bestehen."

# --- 2) Kaputtes Gewerk: Ablehnung, alte Logik laeuft weiter -------------------
schreibe '{"pfad":"logik/zweit.yaml","inhalt":"knoten:\n  murks:\n    baustein: GIBTSNICHT\nkanten: []\n"}'
kaputt=$(post /api/gewerk/aktivieren '{}')
echo "$kaputt" | grep -q '"angenommen":false' || { echo "FAIL: kaputtes Gewerk wurde aktiviert: $kaputt"; exit 1; }
echo "OK: kaputtes Gewerk abgelehnt ($(echo "$kaputt" | head -c 120)…)."

sim events_clear >/dev/null
# Wert MUSS kippen: die Kante des NOT-Knotens feuert per Default nur bei
# Aenderung (on-change). Ein zweites `1` waere kein Ereignis und der Test
# wuerde einen Fehler sehen, wo keiner ist.
sim send 1/0/3 0 >/dev/null
alt_laeuft=nein
for i in $(seq 1 20); do
  if sim events -n 60 | grep '"ev": "rx"' | grep -q '"ga": "1/0/9"'; then alt_laeuft=ja; break; fi
  sleep 0.5
done
[ "$alt_laeuft" = ja ] || {
  echo "FAIL: nach abgelehntem Reload steuert die alte Logik nicht mehr"; sim events -n 60; exit 1; }
echo "OK: nach der Ablehnung steuert die alte Logik unveraendert weiter."

# Wieder eine gueltige Datei hinlegen, damit der naechste Reload gelingt.
schreibe '{"pfad":"logik/zweit.yaml","inhalt":"knoten:\n  n1:\n    baustein: NOT\nkanten:\n  - von: dp:flur.impuls\n    nach: n1.in\n  - von: n1.out\n    nach: dp:flur.zweit\n"}'

# --- 3) Laufender Timer ueberlebt den Reload (T-5) ----------------------------
sim events_clear >/dev/null
sim send 1/0/3 1 >/dev/null
an=nein
for i in $(seq 1 20); do
  if sim events -n 60 | grep '"ev": "rx"' | grep '"ga": "1/0/4"' | grep -q '"value": 1'; then an=ja; break; fi
  sleep 0.5
done
[ "$an" = ja ] || { echo "FAIL: Treppenlicht ging nicht an"; sim events -n 60; exit 1; }

sleep 2
post /api/gewerk/aktivieren '{}' | grep -q '"angenommen":true' || { echo "FAIL: Reload waehrend Timer"; exit 1; }
echo "Reload mitten im laufenden 15-s-Timer ausgeloest …"
sim events_clear >/dev/null

aus=nein
for i in $(seq 1 40); do
  if sim events -n 60 | grep '"ev": "rx"' | grep '"ga": "1/0/4"' | grep -q '"value": 0'; then aus=ja; break; fi
  sleep 1
done
[ "$aus" = ja ] || {
  echo "FAIL: Licht blieb nach dem Reload an — Timer ging verloren (T-5 verletzt)"
  sim events -n 60; exit 1; }
echo "OK: laufender Timer hat den Reload ueberlebt und schaltete aus."

# --- 4) Beobachtungsmodus ueberlebt den Reload (heilig) -----------------------
FACHWERK_KNX_MODUS=beobachten $COMPOSE up -d --force-recreate fachwerk >/dev/null
warte_api
warte_tunnel
curl -s -H "$AUTH" "$BASIS/api/status" | grep -q '"modus":"beobachten"' || {
  echo "FAIL: Beobachtungsmodus nicht aktiv"; exit 1; }

post /api/gewerk/aktivieren '{}' | grep -q '"angenommen":true' || { echo "FAIL: Reload im Beobachtungsmodus"; exit 1; }
curl -s -H "$AUTH" "$BASIS/api/status" | grep -q '"modus":"beobachten"' || {
  echo "FAIL: Beobachtungsmodus nach Reload verloren — Regelbruch!"; exit 1; }

sim events_clear >/dev/null
post /api/datenpunkte/flur.licht '{"wert":true}' | grep -q 'nicht auf den Bus gesendet' || {
  echo "FAIL: Antwort verschweigt den Beobachtungsmodus nach Reload"; exit 1; }
sleep 3
if sim events -n 60 | grep '"ev": "rx"' | grep -q '"ga": "1/0/4"'; then
  echo "FAIL: nach Reload im Beobachtungsmodus ging ein Telegramm auf den Bus!"
  sim events -n 60; exit 1
fi
echo "OK: Beobachtungsmodus unveraendert — auch nach dem Reload wird nie gesendet."

echo "OK: Reload-E2E bestanden."
