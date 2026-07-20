# Auth & Scopes (P5-12, ADR-0009 A-3/A-4)

Dieses Dokument beschreibt den **API-Vertrag** der Anmeldung — damit die
Admin-UI (Spur 2/Codex) ihr Login-Formular bauen kann, ohne den Kern zu lesen,
und damit Agenten wissen, wie sie an ihre Rechte kommen.

Die verbindliche Referenz der Berechtigungen ist der Test
`core/src/api/scope-matrix.test.ts`: dort steht jede Route mit ihrem Scope.
Prosa veraltet, Tests nicht.

## Die vier Scopes

| Scope          | Öffnet                                                            |
| -------------- | ----------------------------------------------------------------- |
| `read`         | alle `GET /api/**` und den Live-Kanal `/api/ws`                    |
| `operate`      | `POST /api/datenpunkte/<schlüssel>` (bedienen)                     |
| `write:gewerk` | `POST /api/gewerk/dateien` (Editor speichert)                      |
| `activate:dev` | `POST /api/gewerk/aktivieren` (neues Gewerk scharf schalten)       |

Zwei Dinge stehen **über** jedem Scope:

- `protected`-Datenpunkte (Schlösser, Alarm, Tore, Zutritt) sind über die API
  mit **keinem** Scope schreibbar — auch nicht mit allen zusammen.
- Der Beobachtungsmodus. Ein angenommener Schreibvorgang erzeugt dort kein
  Telegramm; die Antwort sagt das im Feld `hinweis` ehrlich dazu.

## Drei Wege an die API

1. **Sitzung** — `POST /api/login` mit Name und Passwort. Antwort enthält das
   Token; zusätzlich setzt der Server es als Cookie `fachwerk_sitzung`
   (HttpOnly, SameSite=Lax, 30 Tage). Der Browser braucht danach nichts weiter
   zu tun; die UI sieht das Token nie.
2. **Statisches Token** — `FACHWERK_API_TOKEN` als `Authorization: Bearer …`.
   Scopes über `FACHWERK_API_TOKEN_SCOPES` (Default `read,operate`).
   Agent-first: ein Skript soll ohne Login arbeiten können.
3. **Anonym** — nur solange **nichts** konfiguriert ist (kein Nutzer, kein
   Token). Dann gilt ausschließlich `read`. Ein unkonfiguriertes Fachwerk ist
   lesbar, aber nie schreibbar.

## Endpunkte

```
POST /api/login    {"name": "...", "passwort": "..."}
  200 {"token": "...", "ablauf": <ms>, "nutzer": "...", "scopes": [...]}
      + Set-Cookie: fachwerk_sitzung=…; HttpOnly; SameSite=Lax; Path=/
  401 {"fehler": "Anmeldung fehlgeschlagen"}      (auch bei unbekanntem Namen)
  429 {"fehler": "zu viele Anmeldeversuche …"}     (5/min/IP)

POST /api/logout   {}
  200 {"abgemeldet": true}   + Cookie wird gelöscht; das Token gilt sofort nicht mehr

GET  /api/ich
  200 {"name": "...", "art": "sitzung|token|anonym", "scopes": [...]}
```

`GET /api/ich` ist der Einstieg für die UI: sie fragt einmal, welche Rechte sie
hat, und blendet danach aus, was ohnehin 403 gäbe. Das ist Bequemlichkeit, kein
Schutz — der Schutz sitzt im Handler.

## Nutzer anlegen

```
fachwerk nutzer anlegen <name> [--scopes read,operate]
fachwerk nutzer entfernen <name>
fachwerk nutzer liste
```

Das Passwort kommt **ausschließlich über stdin**, nie über Argumente (die
stehen in der Prozessliste und in der Shell-Historie):

```
printf 'geheim\n' | fachwerk nutzer anlegen anna --scopes read,operate
```

Hashes: `scrypt` aus `node:crypto` — bewusst nicht argon2, das wäre ein
natives Paket und damit ein Bruch der Null-Dependency-Linie.

`nutzer.yaml` liegt im **Daten-Verzeichnis** (`FACHWERK_DATEN_DIR`), nicht im
Gewerk: das Gewerk ist versionierte Definition und wandert in ein Git-Repo —
Passwort-Hashes haben dort nichts verloren. Sitzungen liegen in
`sitzungen.sqlite`, und zwar nur als SHA-256 des Tokens.

**Sobald der erste Nutzer existiert, ist die Auth scharf** (Neustart nötig):
ab dann braucht jede `/api`-Anfrage eine Anmeldung.

## Härtung

- Security-Header auf jeder Antwort: `nosniff`, `Referrer-Policy: no-referrer`,
  `X-Frame-Options: DENY`; für die UI zusätzlich eine CSP mit
  `frame-ancestors 'none'` und `script-src 'self'`.
- **CORS ist bewusst aus.** UI und API liegen auf derselben Origin — was es
  nicht gibt, kann nicht falsch konfiguriert werden.
- CSRF: SameSite=Lax plus ein zweiter Riegel — passt ein mitgeschickter
  `Origin`-Header nicht zum `Host`, wird jede ändernde Anfrage abgelehnt.
  Fehlt der Header ganz (curl, Agenten), wird nicht geblockt: die tragen ihr
  Token bewusst selbst.
- Rate-Limits: 5 Anmeldeversuche pro Minute und IP (`FACHWERK_LOGIN_LIMIT`);
  Schreibzugriffe global über die Schreibbremse (`FACHWERK_API_SCHREIBLIMIT`).
- Passwort- und Tokenvergleich zeitkonstant; unbekannter Nutzername rechnet
  gegen einen Dummy-Hash, damit die Antwortzeit keine Namen verrät.
- Das Audit (`audit.jsonl`) nennt seit P5-12 zusätzlich `nutzer` und `scope` —
  auch bei abgelehnten Versuchen.

## Was hier NICHT drin ist

- **PROD-Freigabe-Workflow** (ADR-0009 A-5) bleibt Phase 6.
- Kein TLS im Prozess: Fachwerk läuft im LAN/VPN, TLS ist Sache eines Proxys
  davor. `FACHWERK_COOKIE_SECURE=1` setzt dann das Secure-Flag.
- Keine Rollen, keine Gruppen, keine Passwort-Ablaufregeln. DEV-Niveau heißt:
  wenige Nutzer, ein Betreiber, klare Rechte.
