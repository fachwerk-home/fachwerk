# Security Policy

Fachwerk steuert Gebäude — Sicherheitslücken behandeln wir entsprechend ernst.

## Lücke melden

Bitte **kein öffentliches Issue**. Melde Verwundbarkeiten vertraulich an die Maintainer
(GitHub Security Advisory / private Meldung, sobald das Repo öffentlich ist; bis dahin
direkt an die Projektgründer). Wir bestätigen den Eingang innerhalb von 7 Tagen.

## Grundsätze

- Koordinierte Offenlegung: Fix vor Veröffentlichung der Details.
- Kein Betriebsmodell mit Port-Forwarding; Fernzugriff nur via VPN — Meldungen, die
  dieses dokumentierte Modell voraussetzen, sind trotzdem willkommen.
- Sicherheitsrelevante Designentscheidungen sind in `docs/ANALYSE-UND-PLAN.md`
  (Abschnitt 4.2) dokumentiert.

## Zugriffsschutz der API (Stand P5-12)

Der vollständige Vertrag steht in `docs/AUTH-UND-SCOPES.md`; die verbindliche
Referenz der Berechtigungen ist der Test `core/src/api/scope-matrix.test.ts`.
Kurzfassung:

- **Vier Scopes** — `read`, `operate`, `write:gewerk`, `activate:dev`. Jede
  Route fordert genau einen; ohne ihn gibt es 403.
- **Zwei Wege hinein** — Sitzung (Login mit scrypt-Passwort → Token, zusätzlich
  als HttpOnly-Cookie) oder statisches Token (`FACHWERK_API_TOKEN`, Scopes über
  `FACHWERK_API_TOKEN_SCOPES`, Default `read,operate`).
- **Solange nichts konfiguriert ist**, ist die API lesend offen und schreibend
  komplett aus — nicht „offen für alle", sondern aus.
- **`protected`-Datenpunkte** (Schlösser, Alarm, Tore, Zutritt) sind über die
  API mit keinem Scope schreibbar. Ebenso unverhandelbar: im Beobachtungsmodus
  geht nie ein Telegramm auf den Bus.
- **Härtung** — Security-Header inkl. CSP, CORS bewusst aus, CSRF über
  SameSite=Lax plus Origin-Prüfung, Login-Rate-Limit 5/min/IP, zeitkonstante
  Vergleiche, Audit mit Nutzer und Scope (auch bei Ablehnungen).

Bekannte Grenzen dieses Standes: kein TLS im Prozess (LAN/VPN-Modell, TLS
gehört vor den Dienst), kein PROD-Freigabe-Workflow (Phase 6), keine Rollen
oder Gruppen.

Diese Policy wird vor dem ersten öffentlichen Release (Phase 7) um konkrete Kontakte,
Supported Versions und Fristen erweitert.
