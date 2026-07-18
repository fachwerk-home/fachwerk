#!/usr/bin/env bash
# E2E der API + des Live-Kanals (P5-2/P5-3) gegen den vollen Stack:
#   1. /api/status meldet Gewerk + verbundenen KNX-Treiber
#   2. Telegramm am Simulator -> Wert erscheint in /api/datenpunkte
#   3. die Kaskade erscheint in /api/traces
#   4. der WebSocket liefert dieselbe Änderung live
#   5. die gebaute UI wird ausgeliefert (falls vorhanden)
set -euo pipefail
cd "$(dirname "$0")/.."

export MSYS_NO_PATHCONV=1
BASIS="http://localhost:8300"

aufraeumen() { docker compose down --remove-orphans --volumes >/dev/null 2>&1 || true; }
trap aufraeumen EXIT

FACHWERK_GEWERK=/gewerke/abnahme-licht-status docker compose up -d --build bus-simulator fachwerk

# Warten, bis die API antwortet
for i in $(seq 1 40); do
  if curl -sf "$BASIS/api/status" >/dev/null 2>&1; then break; fi
  [ "$i" = 40 ] && { echo "FAIL: API antwortet nicht"; docker compose logs fachwerk | tail -20; exit 1; }
  sleep 1
done
echo "API antwortet."

# 1) Status: Gewerk-Name + KNX verbunden
status=$(curl -s "$BASIS/api/status")
echo "$status" | grep -q '"gewerk"' || { echo "FAIL: kein Gewerk im Status"; echo "$status"; exit 1; }
for i in $(seq 1 20); do
  curl -s "$BASIS/api/status" | grep -q '"knx":{"verbunden":true' && break
  [ "$i" = 20 ] && { echo "FAIL: KNX nicht verbunden laut API"; curl -s "$BASIS/api/status"; exit 1; }
  sleep 1
done
echo "OK: /api/status meldet Gewerk und verbundenen KNX-Treiber."

# 4) WebSocket-Mitschnitt starten (im fachwerk-Container, Node ist dort da)
docker compose exec -T -d fachwerk node -e '
const {createHash,randomBytes}=require("node:crypto"), net=require("node:net");
const key=randomBytes(16).toString("base64");
const s=net.connect(8300,"127.0.0.1",()=>s.write(
 "GET /api/ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"+
 "Sec-WebSocket-Key: "+key+"\r\nSec-WebSocket-Version: 13\r\n\r\n"));
const fs=require("node:fs"); let kopf=false, puf=Buffer.alloc(0);
s.on("data",c=>{ puf=Buffer.concat([puf,c]);
  if(!kopf){const i=puf.indexOf("\r\n\r\n"); if(i<0)return; kopf=true; puf=puf.subarray(i+4);}
  while(puf.length>=2){let len=puf[1]&0x7f,off=2;
    if(len===126){len=puf.readUInt16BE(2);off=4;} else if(len===127){len=Number(puf.readBigUInt64BE(2));off=10;}
    if(puf.length<off+len)return;
    fs.appendFileSync("/tmp/ws.log",puf.subarray(off,off+len).toString()+"\n");
    puf=puf.subarray(off+len);}});
' 2>/dev/null || true
sleep 2

# 2) Telegramm injizieren
docker compose exec -T bus-simulator python simctl.py 127.0.0.1 send 6/1/83 1 >/dev/null
echo "Injiziert: 6/1/83 = 1"

for i in $(seq 1 20); do
  if curl -s "$BASIS/api/datenpunkte?filter=kueche" | grep -q '"wert":true'; then
    echo "OK: Wert erscheint in /api/datenpunkte."
    break
  fi
  [ "$i" = 20 ] && { echo "FAIL: Wert nicht in der API"; curl -s "$BASIS/api/datenpunkte?filter=kueche"; exit 1; }
  sleep 0.5
done

# 3) Trace vorhanden
curl -s "$BASIS/api/traces?n=10" | grep -q '"schritte"' \
  || { echo "FAIL: keine Traces"; curl -s "$BASIS/api/traces?n=5"; exit 1; }
echo "OK: Kaskade in /api/traces."

# 4) WS-Mitschnitt prüfen
for i in $(seq 1 20); do
  if docker compose exec -T fachwerk cat /tmp/ws.log 2>/dev/null | grep -q '"art":"wert"'; then
    echo "OK: WebSocket lieferte die Änderung live."
    break
  fi
  [ "$i" = 20 ] && {
    echo "FAIL: nichts über den WebSocket empfangen"
    docker compose exec -T fachwerk cat /tmp/ws.log 2>/dev/null || true
    exit 1
  }
  sleep 0.5
done

# 5) UI (nur wenn ins Image gebaut).
# „|| true": curl liefert unter Git-Bash/Windows gelegentlich Exit 23
# (Write-Error) trotz HTTP 200 — das darf den Test nicht abbrechen.
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASIS/" || true)
if [ "$code" = "200" ]; then echo "OK: UI wird ausgeliefert."; else echo "Hinweis: UI nicht erreichbar (HTTP $code)"; fi

echo "OK: API/WS-E2E bestanden."
