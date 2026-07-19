# AUFTRAG P5-UI: Design-System v2 — modern, dicht, schnell

- **Spur:** 2 (Codex) · **Branch:** `auftrag/p5-ui-design-v2`
- **Abgabe:** PR gegen `main`. Regeln: `AGENTS.md` (Branch von origin/main,
  eigenes Worktree, Gates BLOCKIEREND, kein `git add .`).
- **Dateibesitz:** `ui/**` komplett (admin, visu, lib, public, vite.config).
  Tabu: alles außerhalb `ui/`.

## Anlass (O-Ton Betreiber)

„Die aktuelle Darstellung ist sehr altmodisch, zwar funktional, aber auch
nicht wirklich effizient." — Beides beheben: **Optik** (moderner
Leitstand-Look) und **Effizienz** (UX-Dichte + Rendering-Performance bei
864+ Datenpunkten und Dauer-Live-Updates).

## Leitplanken (nicht verhandelbar)

- ADR-0013 bleibt: Preact, plain CSS mit Custom Properties, **kein UI-Kit,
  keine neue Dependency** (auch kein Icon-Font — Icons als inline-SVG).
- Die UI bleibt reiner API-Client; keine API-Änderungen (Wünsche → PR-Text).
- Beide Einstiege (admin/visu) teilen `ui/src/lib/stil.css` als Token-Basis.

## Teil A — Design-System v2 (sofort)

1. **Token-Ebene ausbauen** (`lib/stil.css`): Größenskala (--fw-s1..s5),
   Typo-Skala, Schatten, Fokus-Ring, Übergänge, Statusfarben (ok/warn/
   fehler/info) + je eine „leise" Flächenvariante; Dark UND Light gepflegt
   (prefers-color-scheme), Kontrast WCAG AA.
2. **Leitstand-Layout Admin:** schmale **Icon-Sidebar links** (Datenpunkte,
   Traces, Logik, künftig Archive/Einstellungen — Platzhalter) statt
   Tab-Buttons oben; Kopfzeile eine Zeile, kompakt: Gewerkname, Verbindungs-
   Badges (KNX/MQTT/live als kleine Punkte mit Tooltip), BEOBACHTUNGS-Banner
   dezent aber unübersehbar. Auf Handy: Sidebar wird Bottom-Bar.
3. **Dichte & Lesbarkeit:** Tabellen kompakter (Zeilenhöhe ~28px), Zebra
   optional, Mono nur für Werte/Schlüssel, ruhige Ränder statt Boxen-in-
   Boxen; leere Zustände mit freundlichem Hinweis statt nackter Fläche.
4. **Visu-Chrome:** gleiche Tokens; Seiten-Hintergrund neutral, Elemente mit
   sauberem Fokus/Aktiv-Zustand (Basis für Bedienen in Teil B).

## Teil B — Effizienz (gleicher PR oder Folge-PR, dann Branch `-teil-b`)

5. **Virtualisierte Datenpunkt-Tabelle:** eigene Lösung (~100 Zeilen: fixe
   Zeilenhöhe, Scroll-Container, sichtbares Fenster + Puffer) statt des
   500er-Caps — alle 864+ Zeilen erreichbar, Scrollen bleibt bei 60 fps.
6. **Update-Batching:** WS-Nachrichten sammeln und einmal pro
   requestAnimationFrame anwenden (statt setState je Telegramm); die
   „frisch"-Markierung ohne Re-Render aller Zeilen (CSS-Klasse je Zeile).
7. **Trace-Liste fenstern** (gleiche Virtualisierung), **Logik-Graph:
   Pan & Zoom** (Maus ziehen + Rad, Touch-Pinch; Reset-Knopf).
8. **Tastatur:** `/` fokussiert Suche, `1/2/3` wechselt Ansichten,
   `Esc` schließt Details/Popups.

## Abnahme

1. Alle 4 Gates + `pnpm --filter @fachwerk/ui build` grün (lokal!).
2. Kein neuer Eintrag in package.json/pnpm-lock.
3. Screenshots (Desktop + 375px, dark + light) im PR — Admin alle drei
   Ansichten + Visu-Beispielseite.
4. Datenpunkt-Ansicht zeigt ALLE Zeilen (kein 500er-Cap mehr) und bleibt
   bei simuliertem Dauerfeuer (Uhr-Ticks) flüssig; kurze Notiz im PR, wie
   gemessen wurde (z. B. Performance-Tab, Long Tasks).
5. `modell.test.ts`-Niveau halten: neue reine Logik (Virtualisierungs-
   Fensterrechnung, Batching-Puffer) als `*.test.ts` mit Vitest.
6. Commits `P5-UI:` nach AGENTS.md § 5; PR listet Design-Entscheidungen
   und offene Wünsche an die API.
