# Mitarbeit an Fachwerk

Danke für dein Interesse! Zwei Regeln sind nicht verhandelbar: die **Clean-Room-Policy**
und der **DCO-Sign-off**. Alles andere ist normale Open-Source-Praxis.

## 1. Clean-Room-Policy (nicht verhandelbar)

Fachwerk ist eine eigenständige Neuentwicklung. EDOMI ist proprietäre Software; ihr Autor
hat Modifikation und Weitergabe untersagt. Deshalb gilt für jeden Beitrag:

**Verboten:**
- EDOMI-Quellcode, -Datenbankinhalte, -Grafiken, -Sounds, -Hilfetexte oder -Doku-Texte
  einbringen — auch nicht in Fragmenten, auch nicht „umformuliert".
- EDOMI-Quellcode **lesen**, um daraus Fachwerk-Code abzuleiten. Wer wesentliche Teile des
  EDOMI-Codes studiert hat, implementiert das betroffene Subsystem nicht selbst, sondern
  beschreibt Verhalten nur als Black-Box-Spec (Zwei-Rollen-Prinzip: Spezifizierer ≠
  Implementierer für kontaminierte Bereiche).
- Dekompilieren/Entschlüsseln geschützter EDOMI-Komponenten.
- Community-Logikbausteine (LBS) Dritter ohne ausdrückliche Lizenz des Autors einbringen.

**Erlaubt und erwünscht:**
- Verhalten einer eigenen, legal betriebenen EDOMI-Installation als Nutzer beobachten und
  als funktionale Spezifikation in `specs/` beschreiben (Black-Box).
- Öffentliches Wissen (Forum-Threads, eigene Erfahrung) als Wissensquelle nutzen —
  Fakten ja, fremde Formulierungen nein.
- Die LBS-API-Oberfläche aus öffentlich geteilten Community-LBS-Dateien ableiten
  (Interoperabilität) — nicht aus EDOMI-Core.

Beiträge, deren Herkunft unklar ist, werden nicht gemergt. Im Zweifel: im Issue fragen,
bevor du Arbeit investierst.

## 2. DCO — Developer Certificate of Origin

Jeder Commit trägt einen Sign-off (`git commit -s`):

    Signed-off-by: Vorname Nachname <mail@example.org>

Damit bestätigst du das [DCO 1.1](https://developercertificate.org/): Du hast das Recht,
den Beitrag unter AGPL-3.0 beizusteuern, und er stammt von dir bzw. aus kompatibel
lizenzierter Quelle (Quelle im Commit nennen). **Das Urheberrecht bleibt bei dir** — es
gibt bewusst keinen CLA.

Hinweis zu Fremdschnipseln: Auch StackOverflow-Inhalte haben eine Lizenz (CC BY-SA).
Kennzeichne Übernahmen; ungekennzeichnete Fremdinhalte sind ein Merge-Blocker.

## 3. Arbeitsweise

- **Spec-first:** Verhalten wird in `specs/` beschrieben, bevor es implementiert wird.
  PRs referenzieren die zugehörige Spec bzw. das Issue.
- **ADRs:** Grundsatzentscheidungen (Stack, Formate, Semantik) laufen über `adr/` —
  kein PR kippt eine beschlossene ADR nebenbei.
- **Tests:** Neue Funktionalität kommt mit Akzeptanztests (KNX-Simulator für buslose CI).
- **Sprache:** Doku und Specs Deutsch; Code, Bezeichner und Commit-Messages Englisch.
- **KI-Beiträge** sind willkommen und gelten wie menschliche: Der einreichende Mensch
  verantwortet Herkunft (Clean-Room!), Qualität und Sign-off.

## 4. Sicherheitsrelevantes

Sicherheitslücken bitte nicht als öffentliches Issue — siehe [SECURITY.md](SECURITY.md).
