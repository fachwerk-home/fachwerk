#!/usr/bin/env bash
# E2E von Auth & Scopes (P5-12) gegen den vollen Stack. Geprueft wird die
# Zusage aus dem Auftrag, nicht die Implementierung:
#   1. ohne konfigurierte Auth: lesen geht, SCHREIBEN nicht (403)
#   2. nach `fachwerk nutzer anlegen`: JEDER /api-Weg braucht Anmeldung (401)
#   3. Login liefert Token + HttpOnly-Cookie; beide oeffnen dieselbe Tuer
#   4. Scopes greifen: read+operate darf bedienen, aber NICHT aktivieren (403)
#   5. Abmelden entwertet das Token sofort
#   6. Login-Rate-Limit schlaegt zu (429), Audit kennt Nutzer und Scope
set -euo pipefail
cd "$(dirname "$0")/.."

export MSYS_NO_PATHCONV=1
export FACHWERK_GEWERK=/gewerke/minimal
BASIS="http://localhost:8300"
PASSWORT="e2e-passwort-123"

aufraeumen() { docker compose down --remove-orphans --volumes >/dev/null 2>&1 || true; }
trap aufraeumen EXIT

code() { curl -s -o /dev/null -w "%{http_code}" "$@" || true; }

warte_api() {
  # Ohne Auth antwortet /api/status mit 200, mit Auth mit 401 — beides heisst
  # „da". Nur „keine Antwort" heisst noch nicht da.
  for i in $(seq 1 40); do
    c=$(code "$BASIS/api/status")
    if [ "$c" = "200" ] || [ "$c" = "401" ]; then return 0; fi
    sleep 1
  done
  echo "FAIL: API antwortet nicht"; docker compose logs fachwerk | tail -20; exit 1
}

# Auch VORHER aufraeumen: Schritt 1 prueft das Verhalten OHNE angelegten
# Nutzer — ein liegengebliebenes Daten-Volume aus einem frueheren Lauf wuerde
# genau diese Ausgangslage zerstoeren (und den Test still verfaelschen).
aufraeumen
docker compose up -d --build bus-simulator fachwerk
warte_api

# --- 1) Ohne konfigurierte Auth: lesend offen, schreibend zu -------------------
[ "$(code "$BASIS/api/status")" = "200" ] || { echo "FAIL: Lesen sollte offen sein"; exit 1; }
schreiben=$(code -X POST -H "content-type: application/json" -d '{"wert":true}' \
  "$BASIS/api/datenpunkte/wohnen.licht")
[ "$schreiben" = "403" ] || { echo "FAIL: Schreiben ohne Auth kam $schreiben statt 403"; exit 1; }
echo "OK: ohne Auth lesend offen, schreibend 403."

# --- 2) Nutzer anlegen -> Auth ist scharf -------------------------------------
# Das Passwort geht ueber stdin, nie ueber argv (steht sonst in der Prozessliste).
printf '%s\n' "$PASSWORT" | docker compose exec -T fachwerk \
  node cli/src/main.ts nutzer anlegen e2e --scopes read,operate >/dev/null
docker compose restart fachwerk >/dev/null
warte_api

for pfad in /api/status /api/datenpunkte /api/ich; do
  c=$(code "$BASIS$pfad")
  [ "$c" = "401" ] || { echo "FAIL: $pfad kam ohne Anmeldung mit $c statt 401"; exit 1; }
done
echo "OK: mit angelegtem Nutzer ist jeder Leseweg 401."

# --- 3) Login: Token im Koerper, Cookie im Header ------------------------------
# Die Antwort-Header werden direkt gelesen, nicht ueber einen Cookie-Jar: das
# Jar-Format haengt vom curl-Build ab, und unter Git Bash versteht das Windows-
# curl den /tmp-Pfad von mktemp nicht. Der Header ist der Vertrag, nicht die Datei.
mkdir -p tmp
kopf=tmp/e2e-auth-kopf.txt
antwort=$(curl -s -D "$kopf" -X POST -H "content-type: application/json" \
  -d "{\"name\":\"e2e\",\"passwort\":\"$PASSWORT\"}" "$BASIS/api/login")
echo "$antwort" | grep -q '"token"' || { echo "FAIL: kein Token: $antwort"; exit 1; }
token=$(echo "$antwort" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

keks=$(grep -i '^set-cookie:' "$kopf" || true)
echo "$keks" | grep -q "fachwerk_sitzung=" || { echo "FAIL: kein Sitzungs-Cookie: $keks"; exit 1; }
echo "$keks" | grep -q "HttpOnly" || { echo "FAIL: Cookie ist nicht HttpOnly: $keks"; exit 1; }
echo "$keks" | grep -q "SameSite=Lax" || { echo "FAIL: Cookie ohne SameSite: $keks"; exit 1; }

[ "$(code -H "Authorization: Bearer $token" "$BASIS/api/status")" = "200" ] \
  || { echo "FAIL: Bearer oeffnet nicht"; exit 1; }
[ "$(code -H "Cookie: fachwerk_sitzung=$token" "$BASIS/api/status")" = "200" ] \
  || { echo "FAIL: Cookie oeffnet nicht"; exit 1; }
echo "OK: Login liefert Token UND HttpOnly-Cookie, beide oeffnen."

# --- 4) Scopes: bedienen ja, aktivieren nein ----------------------------------
bedienen=$(curl -s -X POST -H "Authorization: Bearer $token" \
  -H "content-type: application/json" -d '{"wert":true}' \
  "$BASIS/api/datenpunkte/wohnen.licht")
echo "$bedienen" | grep -q '"angenommen":true' \
  || { echo "FAIL: operate durfte nicht bedienen: $bedienen"; exit 1; }

aktivieren=$(code -X POST -H "Authorization: Bearer $token" \
  -H "content-type: application/json" -d '{}' "$BASIS/api/gewerk/aktivieren")
[ "$aktivieren" = "403" ] \
  || { echo "FAIL: ohne activate:dev kam $aktivieren statt 403"; exit 1; }

# protected steht ueber jedem Scope (AGENTS.md Regel 5).
geschuetzt=$(code -X POST -H "Authorization: Bearer $token" \
  -H "content-type: application/json" -d '{"wert":true}' "$BASIS/api/datenpunkte/wohnen.tuer")
[ "$geschuetzt" = "403" ] || { echo "FAIL: protected kam mit $geschuetzt statt 403"; exit 1; }
echo "OK: operate bedient, aktiviert NICHT, protected bleibt zu."

# --- 5) Abmelden entwertet sofort ----------------------------------------------
curl -s -X POST -H "Authorization: Bearer $token" -H "content-type: application/json" \
  -d '{}' "$BASIS/api/logout" >/dev/null
nach=$(code -H "Authorization: Bearer $token" "$BASIS/api/status")
[ "$nach" = "401" ] || { echo "FAIL: Token gilt nach dem Abmelden noch ($nach)"; exit 1; }
echo "OK: Abmelden entwertet das Token sofort."

# --- 6) Rate-Limit + Audit ------------------------------------------------------
limit_erreicht=0
for i in $(seq 1 8); do
  c=$(code -X POST -H "content-type: application/json" \
    -d '{"name":"e2e","passwort":"falsch"}' "$BASIS/api/login")
  [ "$c" = "429" ] && { limit_erreicht=1; break; }
done
[ "$limit_erreicht" = "1" ] || { echo "FAIL: Login-Rate-Limit hat nie gegriffen"; exit 1; }
echo "OK: Login-Rate-Limit greift (429)."

docker compose exec -T fachwerk grep -q '"nutzer":"e2e"' /daten/audit.jsonl \
  || { echo "FAIL: Audit nennt den Nutzer nicht"
       docker compose exec -T fachwerk cat /daten/audit.jsonl; exit 1; }
docker compose exec -T fachwerk grep -q '"scope":"activate:dev"' /daten/audit.jsonl \
  || { echo "FAIL: Audit nennt den fehlenden Scope nicht"; exit 1; }
echo "OK: Audit protokolliert Nutzer und Scope."

rm -f "$kopf"
echo "OK: Auth-E2E bestanden."
