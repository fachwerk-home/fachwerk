import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { LogikSeite, LogikKnoten, TriggerSemantik } from "../../../schema/src/index.ts";
import { ApiFehler, api, type DatenpunktSicht, type GewerkSeite, type GewerkStruktur } from "../lib/api.ts";
import {
  entferneKante,
  fuegeKnotenEin,
  loescheKnoten,
  paletteAusGewerk,
  portsFuer,
  setzeOderErsetzeKante,
  validiereLogik,
  type BausteinPaletteEintrag,
} from "./logik-editor-modell.ts";
import { inhaltZumSpeichern } from "./logik-yaml.ts";

type RefTyp = { art: "dp"; ref: string } | { art: "port"; ref: string; richtung: "ein" | "aus" };
type Meldung = { ton: "ok" | "warn" | "fehler"; text: string };
type Positionen = Record<string, { x: number; y: number }>;

interface KnotenBox {
  id: string;
  art: "baustein" | "dp";
  baustein?: string;
  eingaenge: string[];
  ausgaenge: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

const KNOTEN_W = 190;
const DP_W = 190;
const PORT_H = 22;
const KOPF_H = 34;
const SPALTE = 260;
const LUECKE = 26;
const RAND = 20;

function zuLogikSeite(seite: GewerkSeite): LogikSeite {
  const knoten: Record<string, LogikKnoten> = {};
  for (const k of seite.knoten) {
    knoten[k.id] = {
      baustein: k.baustein,
      ...(Object.keys(k.parameter ?? {}).length > 0 ? { parameter: structuredClone(k.parameter) } : {}),
    };
  }
  return {
    ...(seite.notizen ? { notizen: seite.notizen } : {}),
    knoten,
    kanten: structuredClone(seite.kanten) as LogikSeite["kanten"],
  };
}

function dateiPfad(seiteKey: string): string {
  return `logik/${seiteKey}.yaml`;
}

function refId(ref: string): string {
  return ref.startsWith("dp:") ? ref.slice(3) : ref.split(".", 1)[0] ?? ref;
}

function istEingang(ref: RefTyp): boolean {
  return ref.art === "dp" || ref.richtung === "ein";
}

function skalarAusText(text: string): unknown {
  const roh = text.trim();
  if (roh === "true") return true;
  if (roh === "false") return false;
  if (roh === "null") return null;
  if (roh !== "" && Number.isFinite(Number(roh))) return Number(roh);
  try {
    return JSON.parse(roh);
  } catch {
    return text;
  }
}

function parameterText(wert: unknown): string {
  return typeof wert === "string" ? wert : JSON.stringify(wert);
}

function layoutFuer(
  seite: LogikSeite,
  palette: readonly BausteinPaletteEintrag[],
  positionen: Positionen,
): { knoten: KnotenBox[]; breite: number; hoehe: number } {
  const paletteMap = new Map(palette.map((b) => [b.id, b]));
  const knoten = new Map<string, KnotenBox>();
  for (const [id, def] of Object.entries(seite.knoten)) {
    const ports = portsFuer(paletteMap.get(def.baustein), def.parameter ?? {});
    knoten.set(id, {
      id,
      art: "baustein",
      baustein: def.baustein,
      eingaenge: ports.eingaenge,
      ausgaenge: ports.ausgaenge,
      x: 0,
      y: 0,
      w: KNOTEN_W,
      h: KOPF_H + Math.max(ports.eingaenge.length, ports.ausgaenge.length, 1) * PORT_H + 12,
    });
  }
  for (const kante of seite.kanten) {
    for (const ref of [kante.von, kante.nach]) {
      if (ref.startsWith("dp:") && !knoten.has(ref.slice(3))) {
        knoten.set(ref.slice(3), { id: ref.slice(3), art: "dp", eingaenge: [], ausgaenge: [], x: 0, y: 0, w: DP_W, h: 30 });
      }
    }
  }
  const schicht = new Map<string, number>();
  for (const id of knoten.keys()) schicht.set(id, 0);
  for (let i = 0; i < Math.min(knoten.size, 40); i += 1) {
    let geaendert = false;
    for (const kante of seite.kanten) {
      const a = schicht.get(refId(kante.von)) ?? 0;
      const ziel = refId(kante.nach);
      const b = schicht.get(ziel) ?? 0;
      if (b < a + 1) {
        schicht.set(ziel, a + 1);
        geaendert = true;
      }
    }
    if (!geaendert) break;
  }
  const spalten = new Map<number, KnotenBox[]>();
  for (const n of knoten.values()) {
    const s = schicht.get(n.id) ?? 0;
    if (!spalten.has(s)) spalten.set(s, []);
    spalten.get(s)!.push(n);
  }
  let breite = 0;
  let hoehe = 0;
  for (const [spalte, liste] of spalten) {
    liste.sort((a, b) => a.id.localeCompare(b.id, "de"));
    let y = RAND;
    for (const n of liste) {
      const manuell = positionen[n.id];
      n.x = manuell?.x ?? RAND + spalte * SPALTE;
      n.y = manuell?.y ?? y;
      y += n.h + LUECKE;
      breite = Math.max(breite, n.x + n.w + RAND);
      hoehe = Math.max(hoehe, n.y + n.h + RAND);
    }
  }
  return { knoten: [...knoten.values()], breite: Math.max(720, breite), hoehe: Math.max(420, hoehe) };
}

function PortKnopf({ refWert, label, aktiv, onPort }: { refWert: RefTyp; label: string; aktiv: boolean; onPort: (ref: RefTyp) => void }) {
  return (
    <button
      class={`logik-port ${aktiv ? "aktiv" : ""}`}
      type="button"
      title={refWert.ref}
      onClick={(event) => {
        event.stopPropagation();
        onPort(refWert);
      }}
    >
      {label}
    </button>
  );
}

function ParameterForm({
  knoten,
  paletteEintrag,
  aendere,
}: {
  knoten: LogikKnoten;
  paletteEintrag: BausteinPaletteEintrag | undefined;
  aendere: (parameter: Record<string, unknown>) => void;
}) {
  const parameter = knoten.parameter ?? {};
  const keys = [...new Set([...Object.keys(paletteEintrag?.parameter ?? {}), ...Object.keys(parameter)])].sort();
  if (keys.length === 0) return <p class="schwach">Dieser Baustein hat keine Parameter.</p>;
  return (
    <div class="logik-parameter">
      {keys.map((key) => {
        const wert = parameter[key] ?? paletteEintrag?.parameter?.[key] ?? "";
        const komplex = typeof wert === "object" && wert !== null;
        return (
          <label key={key}>
            {key}
            {typeof wert === "boolean" ? (
              <select
                value={String(wert)}
                onChange={(event) => aendere({ ...parameter, [key]: (event.target as HTMLSelectElement).value === "true" })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : komplex ? (
              <textarea
                rows={4}
                value={JSON.stringify(wert, null, 2)}
                onInput={(event) => aendere({ ...parameter, [key]: skalarAusText((event.target as HTMLTextAreaElement).value) })}
              />
            ) : (
              <input
                value={parameterText(wert)}
                onInput={(event) => aendere({ ...parameter, [key]: skalarAusText((event.target as HTMLInputElement).value) })}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

export function LogikEditor({
  gewerk,
  dps,
  seiteKey,
  setSeiteKey,
}: {
  gewerk: GewerkStruktur;
  dps: DatenpunktSicht[];
  seiteKey: string;
  setSeiteKey: (key: string) => void;
}) {
  const apiSeite = gewerk.seiten.find((s) => s.name === seiteKey) ?? gewerk.seiten[0]!;
  const [seite, setSeite] = useState<LogikSeite>(() => zuLogikSeite(apiSeite));
  const [raw, setRaw] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [dpFilter, setDpFilter] = useState("");
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [readonlyGrund, setReadonlyGrund] = useState<string | null>(null);
  const [verbindung, setVerbindung] = useState<RefTyp | null>(null);
  const [positionen, setPositionen] = useState<Record<string, Positionen>>({});
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; start: { x: number; y: number } } | null>(null);
  const vergangenheit = useRef<LogikSeite[]>([]);
  const zukunft = useRef<LogikSeite[]>([]);

  const palette = useMemo(() => paletteAusGewerk(gewerk.bausteine), [gewerk.bausteine]);
  const paletteMap = useMemo(() => new Map(palette.map((b) => [b.id, b])), [palette]);
  const probleme = useMemo(() => validiereLogik(seite), [seite]);
  const layout = useMemo(() => layoutFuer(seite, palette, positionen[seiteKey] ?? {}), [seite, palette, positionen, seiteKey]);
  const knotenMap = useMemo(() => new Map(layout.knoten.map((k) => [k.id, k])), [layout.knoten]);
  const gefiltertePalette = palette.filter((b) => `${b.id} ${b.name}`.toLowerCase().includes(filter.toLowerCase())).slice(0, 60);
  const datenpunkte = dps.filter((dp) => !dpFilter || `${dp.schluessel} ${dp.name}`.toLowerCase().includes(dpFilter.toLowerCase())).slice(0, 80);

  useEffect(() => {
    let aktiv = true;
    const naechste = gewerk.seiten.find((s) => s.name === seiteKey) ?? gewerk.seiten[0];
    if (!naechste) return;
    setSeite(zuLogikSeite(naechste));
    setDirty(false);
    setAuswahl(null);
    setVerbindung(null);
    vergangenheit.current = [];
    zukunft.current = [];
    setRaw(null);
    void api.gewerkDatei(dateiPfad(naechste.name))
      .then((antwort) => { if (aktiv) setRaw(antwort.inhalt); })
      .catch(() => { if (aktiv) setRaw(null); });
    return () => { aktiv = false; };
  }, [gewerk.seiten, seiteKey]);

  const setze = (naechste: LogikSeite, auswahlNeu = auswahl): void => {
    vergangenheit.current.push(structuredClone(seite));
    zukunft.current = [];
    setSeite(naechste);
    setAuswahl(auswahlNeu);
    setDirty(true);
  };
  const aendere = (mutator: (entwurf: LogikSeite) => void): void => {
    const entwurf = structuredClone(seite);
    mutator(entwurf);
    setze(entwurf);
  };
  const undo = (): void => {
    const vorher = vergangenheit.current.pop();
    if (!vorher) return;
    zukunft.current.unshift(structuredClone(seite));
    setSeite(vorher);
    setDirty(true);
  };
  const redo = (): void => {
    const naechste = zukunft.current.shift();
    if (!naechste) return;
    vergangenheit.current.push(structuredClone(seite));
    setSeite(naechste);
    setDirty(true);
  };
  const save = async (): Promise<void> => {
    if (readonlyGrund) return;
    const inhalt = inhaltZumSpeichern(seite, raw, dirty);
    try {
      const antwort = await api.schreibeGewerkDatei(dateiPfad(seiteKey), inhalt);
      setRaw(inhalt);
      setDirty(false);
      setMeldung({ ton: "ok", text: `Gespeichert: ${antwort.pfad ?? dateiPfad(seiteKey)}` });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (error instanceof ApiFehler && (error.status === 401 || error.status === 403)) setReadonlyGrund(text);
      setMeldung({ ton: "fehler", text });
    }
  };
  const aktivieren = async (): Promise<void> => {
    const fehler = probleme.filter((p) => p.art === "fehler");
    if (fehler.length > 0) {
      setMeldung({ ton: "fehler", text: `Aktivieren blockiert: ${fehler.map((p) => `${p.ort}: ${p.text}`).join(" | ")}` });
      return;
    }
    try {
      const antwort = await api.aktiviereGewerk();
      setMeldung({ ton: "ok", text: `Aktiviert in ${antwort.dauerMs ?? 0} ms` });
    } catch (error) {
      const text = error instanceof ApiFehler && Array.isArray(error.koerper.fehler)
        ? error.koerper.fehler.join(" | ")
        : error instanceof Error ? error.message : String(error);
      if (error instanceof ApiFehler && (error.status === 401 || error.status === 403)) setReadonlyGrund(text);
      setMeldung({ ton: "fehler", text });
    }
  };
  const portClick = (ref: RefTyp): void => {
    if (!verbindung) {
      setVerbindung(ref);
      return;
    }
    if (verbindung.ref === ref.ref || istEingang(verbindung) === istEingang(ref)) {
      setVerbindung(ref);
      return;
    }
    const von = istEingang(verbindung) ? ref.ref : verbindung.ref;
    const nach = istEingang(verbindung) ? verbindung.ref : ref.ref;
    setze(setzeOderErsetzeKante(seite, { von, nach }), auswahl);
    setVerbindung(null);
  };
  const ausgewaehlt = auswahl ? seite.knoten[auswahl] : undefined;
  const ausgewaehltPalette = ausgewaehlt ? paletteMap.get(ausgewaehlt.baustein) : undefined;

  return (
    <div class="logik-editor">
      <div class="werkzeuge editor-toolbar">
        <select value={seiteKey} onChange={(event) => setSeiteKey((event.target as HTMLSelectElement).value)}>
          {gewerk.seiten.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.knoten.length} Knoten)</option>)}
        </select>
        <button disabled={vergangenheit.current.length === 0} onClick={undo}>↶</button>
        <button disabled={zukunft.current.length === 0} onClick={redo}>↷</button>
        {readonlyGrund && <span class="warn-chip" title={readonlyGrund}>Read-only</span>}
        <button class="primaer" disabled={Boolean(readonlyGrund)} onClick={() => void save()}>{dirty ? "Speichern*" : "Speichern"}</button>
        <button disabled={Boolean(readonlyGrund)} onClick={() => void aktivieren()}>Aktivieren</button>
        <span class="schwach">Validierung lokal bis API /api/gewerk/validieren existiert.</span>
      </div>
      {meldung && <div class={`editor-meldung ${meldung.ton}`}>{meldung.text}</div>}
      {probleme.length > 0 && (
        <div class="logik-probleme">
          {probleme.map((p) => <span key={`${p.art}-${p.ort}-${p.text}`} class={p.art === "fehler" ? "fehler" : "warn"}>{p.ort}: {p.text}</span>)}
        </div>
      )}
      <div class="logik-editor-layout">
        <aside class="editor-panel logik-palette">
          <h2>Bausteine</h2>
          <input value={filter} placeholder="Suchen" onInput={(event) => setFilter((event.target as HTMLInputElement).value)} />
          {gefiltertePalette.map((b) => (
            <button key={b.id} draggable onDragStart={(event) => event.dataTransfer?.setData("text/plain", b.id)} onClick={() => {
              const erg = fuegeKnotenEin(seite, b);
              setze(erg.seite, erg.key);
            }}>
              <strong>{b.id}</strong><span>{b.name}</span>{b.stub && <small>Stub verdrahtbar · Verhalten fehlt</small>}
            </button>
          ))}
          <h2>Datenpunkte</h2>
          <input value={dpFilter} placeholder="DP suchen" onInput={(event) => setDpFilter((event.target as HTMLInputElement).value)} />
          <div class="logik-dp-liste">
            {datenpunkte.map((dp) => <button key={dp.schluessel} onClick={() => portClick({ art: "dp", ref: `dp:${dp.schluessel}` })}>{dp.schluessel}<span>{dp.name}</span></button>)}
          </div>
        </aside>
        <div
          class="logik-editor-canvas"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const b = paletteMap.get(event.dataTransfer?.getData("text/plain") ?? "");
            if (!b) return;
            const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
            const erg = fuegeKnotenEin(seite, b);
            setPositionen((alt) => ({ ...alt, [seiteKey]: { ...(alt[seiteKey] ?? {}), [erg.key]: { x: event.clientX - rect.left, y: event.clientY - rect.top } } }));
            setze(erg.seite, erg.key);
          }}
          onPointerMove={(event) => {
            if (!drag) return;
            setPositionen((alt) => ({
              ...alt,
              [seiteKey]: {
                ...(alt[seiteKey] ?? {}),
                [drag.id]: {
                  x: Math.max(0, drag.start.x + event.clientX - drag.x),
                  y: Math.max(0, drag.start.y + event.clientY - drag.y),
                },
              },
            }));
          }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <div class="logik-editor-flaeche" style={{ width: layout.breite, height: layout.hoehe }}>
            <svg class="logik-editor-kanten" width={layout.breite} height={layout.hoehe}>
              {seite.kanten.map((kante, i) => {
                const a = knotenMap.get(refId(kante.von));
                const b = knotenMap.get(refId(kante.nach));
                if (!a || !b) return null;
                const x1 = a.x + a.w;
                const y1 = a.y + a.h / 2;
                const x2 = b.x;
                const y2 = b.y + b.h / 2;
                const dx = Math.max(40, (x2 - x1) / 2);
                return <path key={i} d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} class="kante" />;
              })}
            </svg>
            {layout.knoten.map((n) => (
              <div
                key={n.id}
                class={`logik-editor-knoten ${n.art === "dp" ? "dp" : ""} ${auswahl === n.id ? "gewaehlt" : ""} ${/^lbs\d+$/.test(n.baustein ?? "") ? "stub" : ""}`}
                style={{ left: n.x, top: n.y, width: n.w, minHeight: n.h }}
                onClick={() => n.art === "baustein" && setAuswahl(n.id)}
                onPointerDown={(event) => {
                  if (n.art !== "baustein" || (event.target as HTMLElement).tagName === "BUTTON") return;
                  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                  setDrag({ id: n.id, x: event.clientX, y: event.clientY, start: { x: n.x, y: n.y } });
                }}
              >
                <strong>{n.art === "dp" ? n.id : n.baustein}{/^lbs\d+$/.test(n.baustein ?? "") ? " ⚠" : ""}</strong>
                {n.art === "dp" ? (
                  <div class="logik-port-zeile"><PortKnopf refWert={{ art: "dp", ref: `dp:${n.id}` }} label="dp" aktiv={verbindung?.ref === `dp:${n.id}`} onPort={portClick} /></div>
                ) : (
                  <div class="logik-port-grid">
                    <div>{n.eingaenge.map((p) => <PortKnopf key={p} refWert={{ art: "port", ref: `${n.id}.${p}`, richtung: "ein" }} label={p} aktiv={verbindung?.ref === `${n.id}.${p}`} onPort={portClick} />)}</div>
                    <div>{n.ausgaenge.map((p) => <PortKnopf key={p} refWert={{ art: "port", ref: `${n.id}.${p}`, richtung: "aus" }} label={p} aktiv={verbindung?.ref === `${n.id}.${p}`} onPort={portClick} />)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div class="logik-hinweis">{verbindung ? `Ziel wählen für ${verbindung.ref}` : "Port oder Datenpunkt anklicken, dann Ziel anklicken · Knoten ziehen = lokale Editorposition"}</div>
        </div>
        <aside class="editor-panel logik-eigenschaften">
          <h2>Eigenschaften</h2>
          {ausgewaehlt && auswahl ? (
            <>
              <label>Knoten<input value={auswahl} disabled /></label>
              <label>Baustein<input value={ausgewaehlt.baustein} disabled /></label>
              {/^lbs\d+$/.test(ausgewaehlt.baustein) && <p class="warn-chip">Stub-Knoten: verdrahtbar, Verhalten fehlt noch.</p>}
              <ParameterForm knoten={ausgewaehlt} paletteEintrag={ausgewaehltPalette} aendere={(parameter) => aendere((entwurf) => {
                const k = entwurf.knoten[auswahl];
                if (!k) return;
                k.parameter = parameter;
              })} />
              <button class="fehler" onClick={() => setze(loescheKnoten(seite, auswahl), null)}>Knoten löschen</button>
            </>
          ) : <p class="schwach">Knoten auswählen.</p>}
          <h2>Kanten</h2>
          <div class="logik-kantenliste">
            {seite.kanten.map((kante, index) => (
              <div key={`${kante.von}-${kante.nach}-${index}`}>
                <code>{kante.von} → {kante.nach}</code>
                <select value={kante.trigger ?? "on-change"} onChange={(event) => aendere((entwurf) => {
                  const trigger = (event.target as HTMLSelectElement).value as TriggerSemantik;
                  if (trigger === "on-change") delete entwurf.kanten[index]?.trigger;
                  else if (entwurf.kanten[index]) entwurf.kanten[index]!.trigger = trigger;
                })}>
                  <option value="on-change">on-change</option>
                  <option value="on-receive">on-receive</option>
                </select>
                <button onClick={() => setze(entferneKante(seite, index))}>Löschen</button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
