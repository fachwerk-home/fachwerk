# AUFTRAG VISU-TOKEN-LIVEKANAL: Visu mit statischem Token bedienbar machen

- **Ausfuehrender:** Codex (Spur 2), Branch `auftrag/visu-token-livekanal`,
  Basis `origin/main`.
- **Dateibesitz:** `ui/src/lib/api.ts` (+ Test). Die Kern-Seite macht Spur 1
  (siehe „Vertrag" unten) und liegt VOR dem Start dieses Auftrags auf main.
- **Umfang:** klein — ein Nachmittag.

## Befund (06.10.2026, beim Bau von tools/visu-abzug.mjs)

Die Visu nimmt ein statisches Token aus `?token=` entgegen und legt es im
localStorage ab (`ui/src/lib/api.ts`, Funktion `token`). Alle `fetch`-Aufrufe
tragen es als Bearer. Der Live-Kanal `/api/ws` kann das nicht: Browser setzen
bei WebSockets keine Header. Der Kern weist das Upgrade ohne `read`-Nachweis
ab (`core/src/api/server.ts`, Upgrade-Handler). Danach fragt `verbindeLive`
bei `onclose` ein `fetch("/api/ich")` OHNE Bearer ab, bekommt 401 und loest
`meldeAuthErforderlich` aus — die Seite springt in die Login-Ansicht, obwohl
Identitaet und Daten laengst geladen waren.

Beobachtbar: `visu.html?seite=x&token=T` zeigt kurz „Rechte werden geprueft",
dann das Login-Formular. Netzwerk: `/api/ich` 200, `/api/visu` 200,
`/api/datenpunkte` 200, dann `/api/ich` 401.

Betroffen ist genau der Agent-first-Pfad (ADR-0009 A-1): ein Agent oder ein
Werkzeug, das die Visu mit FACHWERK_API_TOKEN oeffnet. Nutzer mit Sitzung
(Cookie) sind nicht betroffen.

## Vertrag (Kern, Spur 1 — vorab auf main)

Der Upgrade-Handler akzeptiert das Token zusaetzlich im Header
`Sec-WebSocket-Protocol` in der Form `fachwerk-token.<token>` und antwortet
mit demselben Subprotokoll. Kein Token in der URL: Query-Strings landen in
Logs und Proxys, Subprotokolle nicht. Bearer-Header und Cookie bleiben wie
sie sind.

## Aufgabe (UI)

1. `verbindeLive` oeffnet den WebSocket mit dem Subprotokoll
   `fachwerk-token.<token>`, wenn ein statisches Token vorliegt; ohne Token
   wie bisher (Cookie).
2. Die Rueckfrage in `onclose` benutzt `hole("/api/ich")` statt eines nackten
   `fetch`, damit sie dasselbe Token traegt wie alle anderen Aufrufe.
3. Test in `ui/src/lib/api.test.ts` (oder neben der Datei): mit Token wird
   der WebSocket mit Subprotokoll angelegt; ohne Token ohne.

## Abnahme

- `visu.html?seite=<seite>&token=<FACHWERK_API_TOKEN>` zeigt die Seite und
  haelt den Live-Kanal (Wertaenderung ueber `POST /api/datenpunkte/...` wird
  ohne Neuladen sichtbar).
- Sitzungs-Login (Cookie) funktioniert unveraendert; `tools/e2e-auth.sh` gruen.
- Alle 4 Gates gruen; Handprobe mit Screenshot im PR.
- `tools/visu-abzug.mjs` laeuft danach auch mit `--token` statt `--nutzer`;
  den Hinweis im Kopf des Skripts darf Spur 1 nach dem Merge streichen.
