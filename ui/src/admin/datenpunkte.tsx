import { memo } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { DatenpunktSicht } from "../lib/api.ts";
import { wertText, zeit } from "./format.ts";
import { berechneFenster } from "./virtualisierung.ts";

const ZEILEN_HOEHE = 28;
type Spalte = "name" | "schluessel" | "adresse" | "wert" | "ts";

function vergleiche(a: DatenpunktSicht, b: DatenpunktSicht, spalte: Spalte): number {
  if (spalte === "ts") return (a.ts ?? -1) - (b.ts ?? -1);
  if (spalte === "wert") {
    if (typeof a.wert === "number" && typeof b.wert === "number") return a.wert - b.wert;
    return wertText(a.wert).localeCompare(wertText(b.wert), "de");
  }
  return (a[spalte] ?? "").localeCompare(b[spalte] ?? "", "de");
}

const DatenpunktZeile = memo(function DatenpunktZeile({
  dp,
  geaendert,
}: {
  dp: DatenpunktSicht;
  geaendert: number;
}) {
  const frisch = Date.now() - geaendert < 1_800;
  return (
    <tr class={frisch ? "frisch" : ""} style={{ height: ZEILEN_HOEHE }}>
      <td>
        {dp.name}
        {dp.protected && <span class="schutz" title="Geschützter Datenpunkt" aria-label="geschützt">◆</span>}
      </td>
      <td class="mono schwach">{dp.schluessel}</td>
      <td class="mono schwach">{dp.adresse ?? "—"}</td>
      <td class="rechts mono">{wertText(dp.wert)}</td>
      <td class="rechts schwach">{zeit(dp.ts)}</td>
    </tr>
  );
});

export function Datenpunkte({
  dps,
  geaendert,
  sucheRef,
}: {
  dps: DatenpunktSicht[];
  geaendert: Record<string, number>;
  sucheRef: { current: HTMLInputElement | null };
}) {
  const [filter, setFilter] = useState("");
  const [klasse, setKlasse] = useState("");
  const [nurGesetzt, setNurGesetzt] = useState(false);
  const [sortier, setSortier] = useState<{ spalte: Spalte; runter: boolean } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHoehe, setViewportHoehe] = useState(560);
  const huelleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = huelleRef.current;
    if (!element) return;
    const aktualisiere = (): void => setViewportHoehe(element.clientHeight);
    aktualisiere();
    const beobachter = new ResizeObserver(aktualisiere);
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, []);

  const sichtbar = useMemo(() => {
    const suche = filter.trim().toLowerCase();
    const ergebnis = dps.filter((d) => {
      if (nurGesetzt && d.ts === null) return false;
      if (klasse && d.klasse !== klasse) return false;
      if (!suche) return true;
      return d.schluessel.toLowerCase().includes(suche)
        || d.name.toLowerCase().includes(suche)
        || (d.adresse ?? "").toLowerCase().includes(suche);
    });
    if (!sortier) return ergebnis;
    return [...ergebnis].sort(
      (a, b) => vergleiche(a, b, sortier.spalte) * (sortier.runter ? -1 : 1),
    );
  }, [dps, filter, klasse, nurGesetzt, sortier]);

  useEffect(() => {
    if (huelleRef.current) huelleRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [filter, klasse, nurGesetzt, sortier]);

  const fenster = berechneFenster({
    anzahl: sichtbar.length,
    scrollTop,
    viewportHoehe: Math.max(1, viewportHoehe - ZEILEN_HOEHE),
    zeilenHoehe: ZEILEN_HOEHE,
  });

  const sortiere = (spalte: Spalte): void => setSortier((alt) =>
    alt?.spalte === spalte
      ? (alt.runter ? null : { spalte, runter: true })
      : { spalte, runter: false },
  );
  const pfeil = (spalte: Spalte): string =>
    sortier?.spalte === spalte ? (sortier.runter ? " ↓" : " ↑") : "";

  return (
    <>
      <div class="werkzeuge">
        <label class="suche">
          <span aria-hidden="true">⌕</span>
          <input
            ref={sucheRef}
            type="search"
            aria-label="Datenpunkte durchsuchen"
            placeholder="Name, Schlüssel, GA oder Topic …"
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
          />
          <kbd>/</kbd>
        </label>
        <select value={klasse} aria-label="Klasse filtern" onChange={(e) => setKlasse((e.target as HTMLSelectElement).value)}>
          <option value="">Alle Klassen</option>
          <option value="bus">Bus</option>
          <option value="intern">Intern</option>
          <option value="system">System</option>
        </select>
        <button aria-pressed={nurGesetzt} onClick={() => setNurGesetzt((v) => !v)}>Nur mit Wert</button>
        <span class="zaehler">{sichtbar.length.toLocaleString("de-DE")} <span class="schwach">von {dps.length.toLocaleString("de-DE")}</span></span>
      </div>

      <div
        ref={huelleRef}
        class="tabelle-huelle datenpunkt-huelle"
        onScroll={(event) => setScrollTop((event.currentTarget as HTMLDivElement).scrollTop)}
      >
        <table class="tabelle">
          <thead>
            <tr>
              <th><button class="sortier-knopf" onClick={() => sortiere("name")}>Name{pfeil("name")}</button></th>
              <th><button class="sortier-knopf" onClick={() => sortiere("schluessel")}>Schlüssel{pfeil("schluessel")}</button></th>
              <th><button class="sortier-knopf" onClick={() => sortiere("adresse")}>Adresse{pfeil("adresse")}</button></th>
              <th class="rechts"><button class="sortier-knopf" onClick={() => sortiere("wert")}>Wert{pfeil("wert")}</button></th>
              <th class="rechts"><button class="sortier-knopf" onClick={() => sortiere("ts")}>Geändert{pfeil("ts")}</button></th>
            </tr>
          </thead>
          <tbody>
            {fenster.oben > 0 && <tr aria-hidden="true" class="platzhalter"><td colSpan={5} style={{ height: fenster.oben }} /></tr>}
            {sichtbar.slice(fenster.start, fenster.ende).map((dp) => {
              const aenderung = geaendert[dp.schluessel] ?? 0;
              return <DatenpunktZeile key={`${dp.schluessel}:${aenderung}`} dp={dp} geaendert={aenderung} />;
            })}
            {fenster.unten > 0 && <tr aria-hidden="true" class="platzhalter"><td colSpan={5} style={{ height: fenster.unten }} /></tr>}
          </tbody>
        </table>
        {sichtbar.length === 0 && (
          <div class="leerzustand"><strong>Keine Datenpunkte gefunden</strong><span>Filter anpassen oder „Nur mit Wert“ ausschalten.</span></div>
        )}
      </div>
    </>
  );
}
