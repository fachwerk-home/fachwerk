# ADR-0001: Arbeitsname „Fachwerk"

- **Status:** Akzeptiert (als Arbeitsname; formaler Markencheck vor Veröffentlichung)
- **Datum:** 2026-07-08
- **Entscheider:** Projektgründer

## Kontext

Der Projektname landet in Repo, Namespaces, Paketnamen und Pfaden und muss vor dem ersten
Commit feststehen. Rote Linien: keine Verwechslungsgefahr mit „EDOMI" (Kennzeichen des
Autors, der jeder Fortführung widersprochen hat) und kein „KNX" als Namensbestandteil
(eingetragene, aktiv verteidigte Marke der KNX Association — auch Anspielungen wie
„…K-NX" scheiden aus, da klanglich identisch).

## Optionen

Geprüft wurden u. a. „Phoenix" (verworfen: abgenutzt; Kollision Phoenix Contact im
Elektro-/Automationsumfeld), „Domovoi", „Lares", „Kardo", „fachwerK-NX" (verworfen:
KNX-Anlehnung) und „Fachwerk".

## Entscheidung

Arbeitsname **Fachwerk** (Repo/Namespace `fachwerk`): deutsches Wort mit
Haus-Struktur-Metapher, international lesbar, nur schwache Kollisionen in fremden Domänen
(designstem/fachwerk, JS-Lern-Framework, inaktiv; Firma „Fachwerk Software"). KNX wird
ausschließlich beschreibend genannt („für KNX & mehr").

## Konsequenzen

Vor dem ersten öffentlichen Release (Phase 7) sind DPMA-/EUIPO-Recherche (Nizza 9/42),
Domain- und GitHub-Org-Check nachzuholen; bis dahin gilt der Name als vorläufig, wird aber
durchgängig verwendet, um spätere Umbenennungskosten klein zu halten.
