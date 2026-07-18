import { useState } from "preact/hooks";
import type { DatenpunktSicht } from "../lib/api.ts";
import { wertText, zeit } from "./format.ts";

type Spalte = "name" | "schluessel" | "adresse" | "wert" | "ts";

function vergleiche(a: DatenpunktSicht, b: DatenpunktSicht, spalte: Spalte): number {
  if (spalte === "ts") return (a.ts ?? -1) - (b.ts ?? -1);
  if (spalte === "wert") {
    const wa = a.wert;
    const wb = b.wert;
    if (typeof wa === "number" && typeof wb === "number") return wa - wb;
    return wertText(wa).localeCompare(wertText(wb), "de");
  }
  return (a[spalte] ?? "").localeCompare(b[spalte] ?? "", "de");
}

export function Datenpunkte({
  dps,
  geaendert,
}: {
  dps: DatenpunktSicht[];
  geaendert: Record<string, number>;
}) {
  const [filter, setFilter] = useState("");
  const [klasse, setKlasse] = useState("");
  const [nurGesetzt, setNurGesetzt] = useState(true);
  const [sortier, setSortier] = useState<{ spalte: Spalte; runter: boolean } | null>(null);

  const suche = filter.trim().toLowerCase();
  let sichtbar = dps.filter((d) => {
    if (nurGesetzt && d.ts === null) return false;
    if (klasse && d.klasse !== klasse) return false;
    if (!suche) return true;
    return (
      d.schluessel.toLowerCase().includes(suche) ||
      d.name.toLowerCase().includes(suche) ||
      (d.adresse ?? "").toLowerCase().includes(suche)
    );
  });
  if (sortier) {
    sichtbar = [...sichtbar].sort(
      (a, b) => vergleiche(a, b, sortier.spalte) * (sortier.runter ? -1 : 1),
    );
  }

  const sortiere = (spalte: Spalte) =>
    setSortier((alt) =>
      alt?.spalte === spalte ? (alt.runter ? null : { spalte, runter: true }) : { spalte, runter: false },
    );
  const pfeil = (spalte: Spalte) =>
    sortier?.spalte === spalte ? (sortier.runter ? " ↓" : " ↑") : "";

  return (
    <>
      <div class="werkzeuge">
        <input
          type="search"
          placeholder="Suchen (Name, Schlüssel, GA/Topic) …"
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
        />
        <select
          value={klasse}
          onChange={(e) => setKlasse((e.target as HTMLSelectElement).value)}
        >
          <option value="">alle Klassen</option>
          <option value="bus">bus</option>
          <option value="intern">intern</option>
          <option value="system">system</option>
        </select>
        <button aria-pressed={nurGesetzt} onClick={() => setNurGesetzt((v) => !v)}>
          nur mit Wert
        </button>
        <span class="schwach">
          {sichtbar.length} von {dps.length}
        </span>
      </div>

      <div class="tabelle-huelle">
        <table class="tabelle">
          <thead>
            <tr>
              <th onClick={() => sortiere("name")}>Name{pfeil("name")}</th>
              <th onClick={() => sortiere("schluessel")}>Schlüssel{pfeil("schluessel")}</th>
              <th onClick={() => sortiere("adresse")}>Adresse{pfeil("adresse")}</th>
              <th class="rechts" onClick={() => sortiere("wert")}>
                Wert{pfeil("wert")}
              </th>
              <th class="rechts" onClick={() => sortiere("ts")}>
                geändert{pfeil("ts")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sichtbar.slice(0, 500).map((d) => {
              const frisch = Date.now() - (geaendert[d.schluessel] ?? 0) < 2000;
              return (
                <tr key={d.schluessel} class={frisch ? "frisch" : ""}>
                  <td>
                    {d.name}
                    {d.protected && (
                      <span class="marke" title="geschützt">
                        🔒
                      </span>
                    )}
                  </td>
                  <td class="mono schwach">{d.schluessel}</td>
                  <td class="mono schwach">{d.adresse ?? "—"}</td>
                  <td class="rechts mono">{wertText(d.wert)}</td>
                  <td class="rechts schwach">{zeit(d.ts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sichtbar.length > 500 && (
        <p class="schwach">… weitere {sichtbar.length - 500} ausgeblendet (Filter nutzen)</p>
      )}
    </>
  );
}
