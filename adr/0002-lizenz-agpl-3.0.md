# ADR-0002: Lizenz AGPL-3.0, DCO statt CLA

- **Status:** Akzeptiert
- **Datum:** 2026-07-08
- **Entscheider:** Projektgründer

## Kontext

Die Kernlehre aus dem EDOMI-Ende: Ein Projekt, dessen Rechte bei einer Person liegen,
kann jederzeit „zugesperrt" werden. Die Community fordert eine offene Lizenz
(siehe docs/ANFORDERUNGEN-COMMUNITY.md, ★★★). Zugleich soll ein späteres Bezahlmodell
rund um das Projekt (Support, Hosting, Hardware, zertifizierte Angebote) möglich bleiben.

## Optionen

- **MIT/Apache-2.0:** maximal permissiv, aber erlaubt proprietäre Vereinnahmung — genau
  das Risiko, das vermieden werden soll.
- **GPL-3.0:** Copyleft, aber SaaS-Lücke (Hosting ohne Quellpflicht).
- **AGPL-3.0:** Copyleft inkl. Netzwerknutzung; schützt am stärksten vor Vereinnahmung.
- **Nicht-kommerzielle Klauseln (CC-NC o. ä.):** nicht OSI-konform, toxisch für
  Distribution und Integrationen — ausgeschlossen.
- **CLA (Rechtebündelung) vs. DCO:** CLA ermöglicht Dual-Licensing/Open-Core, schafft
  aber genau die zentrale Rechtemacht, die das EDOMI-Schicksal verursacht hat.

## Entscheidung

**AGPL-3.0** für das gesamte Projekt. Beiträge unter **DCO** (`Signed-off-by`), das
Urheberrecht verbleibt bei den Contributors. Kein CLA.

## Konsequenzen

- Niemand — auch die Gründer nicht — kann das Projekt nachträglich proprietär machen;
  Dual-Licensing/Open-Core ist damit dauerhaft ausgeschlossen (bewusst in Kauf genommen).
- Kommerz bleibt möglich über Dienstleistungen, Hosting, Hardware und eine später
  markenrechtlich geschützte Zertifizierung („Fachwerk certified").
- SDK-/Schnittstellen-Grenzen für Treiber/Bausteine Dritter werden in einer eigenen ADR
  geklärt (Lizenzwirkung der AGPL auf Plugins), bevor die Baustein-Registry startet.
