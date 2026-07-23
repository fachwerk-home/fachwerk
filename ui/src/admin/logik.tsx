/**
 * Logik-Monitor (P5-5, read-only): Logikseiten als Graph mit Live-Werten.
 * Layout ist bewusst simpel — Schichten nach Topologie (kantensicher auch bei
 * Zyklen), keine Kantenkreuzungs-Optimierung. Der Editor (P5-11) baut darauf auf.
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { DatenpunktSicht, GewerkSeite, GewerkStruktur, Wert } from "../lib/api.ts";
import { wertText, zeit } from "./format.ts";
import { LogikEditor } from "./logik-editor.tsx";

/** Letzter Trace-Schritt je Knoten (Schlüssel: "seite/knotenId"). */
export interface LetzterSchritt {
  ts: number;
  traceNr: number;
  eingaenge: Record<string, Wert | undefined>;
  ausgaenge: Record<string, Wert> | null;
  fehler?: string | undefined;
}

type Ende = { art: "dp"; schluessel: string } | { art: "port"; knoten: string; port: string };

function parseEnde(s: string): Ende {
  if (s.startsWith("dp:")) return { art: "dp", schluessel: s.slice(3) };
  const punkt = s.lastIndexOf(".");
  return { art: "port", knoten: s.slice(0, punkt), port: s.slice(punkt + 1) };
}

const portSort = (a: string, b: string) => a.localeCompare(b, "de", { numeric: true });

// Layout-Konstanten (SVG-Einheiten = Pixel)
const SPALTE_B = 250;
const KNOTEN_B = 165;
const DP_B = 180;
const PORT_H = 16;
const KOPF_H = 22;
const LUECKE = 14;
const RAND = 16;

interface LKnoten {
  id: string; // Knoten-ID oder dp-Schlüssel
  art: "baustein" | "dp";
  baustein?: string;
  eingaenge: string[];
  ausgaenge: string[];
  x: number;
  y: number;
  b: number;
  h: number;
}

interface LKante {
  von: Ende;
  nach: Ende;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function baueLayout(
  seite: GewerkSeite,
  manifeste: Map<string, { eingaenge: string[]; ausgaenge: string[] }>,
): { knoten: LKnoten[]; kanten: LKante[]; breite: number; hoehe: number } {
  const knoten = new Map<string, LKnoten>();
  for (const k of seite.knoten) {
    const m = manifeste.get(k.baustein);
    knoten.set(k.id, {
      id: k.id,
      art: "baustein",
      baustein: k.baustein,
      eingaenge: [...(m?.eingaenge ?? [])],
      ausgaenge: [...(m?.ausgaenge ?? [])],
      x: 0,
      y: 0,
      b: KNOTEN_B,
      h: 0,
    });
  }

  const kantenEnden: Array<{ von: Ende; nach: Ende }> = [];
  for (const k of seite.kanten) {
    const von = parseEnde(k.von);
    const nach = parseEnde(k.nach);
    kantenEnden.push({ von, nach });
    for (const e of [von, nach]) {
      if (e.art === "dp" && !knoten.has(e.schluessel)) {
        knoten.set(e.schluessel, {
          id: e.schluessel,
          art: "dp",
          eingaenge: [],
          ausgaenge: [],
          x: 0,
          y: 0,
          b: DP_B,
          h: KOPF_H,
        });
      }
    }
    // Ports, die nur über Kanten bekannt sind (Stdlib-Manifeste kennt die API nicht)
    if (von.art === "port") {
      const n = knoten.get(von.knoten);
      if (n && !n.ausgaenge.includes(von.port)) n.ausgaenge.push(von.port);
    }
    if (nach.art === "port") {
      const n = knoten.get(nach.knoten);
      if (n && !n.eingaenge.includes(nach.port)) n.eingaenge.push(nach.port);
    }
  }

  for (const n of knoten.values()) {
    if (n.art !== "baustein") continue;
    n.eingaenge.sort(portSort);
    n.ausgaenge.sort(portSort);
    n.h = KOPF_H + Math.max(n.eingaenge.length, n.ausgaenge.length, 1) * PORT_H + 6;
  }

  // Schichten: Kanten-Relaxation mit Iterations-Deckel — terminiert auch bei
  // Zyklen (entkoppelte Bausteine!) und liefert dann eine brauchbare Ordnung.
  const schicht = new Map<string, number>();
  for (const id of knoten.keys()) schicht.set(id, 0);
  const idVon = (e: Ende) => (e.art === "dp" ? e.schluessel : e.knoten);
  for (let i = 0; i < Math.min(knoten.size, 40); i++) {
    let geaendert = false;
    for (const k of kantenEnden) {
      const a = schicht.get(idVon(k.von)) ?? 0;
      const b = schicht.get(idVon(k.nach)) ?? 0;
      if (b < a + 1) {
        schicht.set(idVon(k.nach), a + 1);
        geaendert = true;
      }
    }
    if (!geaendert) break;
  }

  // Positionen: Spalte = Schicht, in der Spalte gestapelt
  const spalten = new Map<number, LKnoten[]>();
  for (const n of knoten.values()) {
    const s = schicht.get(n.id) ?? 0;
    if (!spalten.has(s)) spalten.set(s, []);
    spalten.get(s)!.push(n);
  }
  let hoehe = 0;
  for (const [s, liste] of spalten) {
    liste.sort((a, b) => a.id.localeCompare(b.id, "de"));
    let y = RAND;
    for (const n of liste) {
      n.x = RAND + s * SPALTE_B;
      n.y = y;
      y += n.h + LUECKE;
    }
    hoehe = Math.max(hoehe, y);
  }
  const breite = RAND * 2 + (Math.max(...[...spalten.keys()], 0) + 1) * SPALTE_B;

  const portY = (n: LKnoten, port: string, eingang: boolean): number => {
    const liste = eingang ? n.eingaenge : n.ausgaenge;
    const i = Math.max(0, liste.indexOf(port));
    return n.y + KOPF_H + i * PORT_H + PORT_H / 2;
  };

  const kanten: LKante[] = kantenEnden.map(({ von, nach }) => {
    const nv = knoten.get(idVon(von))!;
    const nn = knoten.get(idVon(nach))!;
    return {
      von,
      nach,
      x1: nv.x + nv.b,
      y1: von.art === "port" ? portY(nv, von.port, false) : nv.y + nv.h / 2,
      x2: nn.x,
      y2: nach.art === "port" ? portY(nn, nach.port, true) : nn.y + nn.h / 2,
    };
  });

  return { knoten: [...knoten.values()], kanten, breite, hoehe };
}

/** Wert an einer Kante: Quelle dp → Live-Wert; Quelle Port → letzter Schritt. */
function kantenWert(
  k: LKante,
  seitenName: string,
  dpWerte: Map<string, Wert | null>,
  schritte: Record<string, LetzterSchritt>,
): Wert | null | undefined {
  if (k.von.art === "dp") return dpWerte.get(k.von.schluessel);
  const s = schritte[`${seitenName}/${k.von.knoten}`];
  return s?.ausgaenge?.[k.von.port];
}

function Detail({
  knoten,
  seite,
  schritt,
  stub,
}: {
  knoten: LKnoten;
  seite: GewerkSeite;
  schritt: LetzterSchritt | undefined;
  stub: boolean;
}) {
  const def = seite.knoten.find((k) => k.id === knoten.id);
  const parameter = Object.entries(def?.parameter ?? {});
  return (
    <div class="karte logik-detail">
      <h3>
        {knoten.id} <span class="schwach">({knoten.baustein})</span>
        {stub && <span class="marke marke-stub">STUB · Portierungs-TODO</span>}
      </h3>
      {parameter.length > 0 && (
        <div>
          <span class="schwach">Parameter:</span>{" "}
          {parameter.map(([k, v]) => (
            <span key={k} class="mono io-paar">
              {k}={String(v)}
            </span>
          ))}
        </div>
      )}
      {schritt ? (
        <div>
          <span class="schwach">
            zuletzt gefeuert {zeit(schritt.ts)} (Trace #{schritt.traceNr}):
          </span>{" "}
          {Object.entries(schritt.eingaenge).map(([k, v]) => (
            <span key={k} class="mono io-paar">
              {k}={wertText(v)}
            </span>
          ))}
          <span class="schwach"> → </span>
          {schritt.ausgaenge === null ? (
            <span class="schwach">kein Ergebnis</span>
          ) : (
            Object.entries(schritt.ausgaenge).map(([k, v]) => (
              <span key={k} class="mono io-paar">
                {k}={wertText(v)}
              </span>
            ))
          )}
          {schritt.fehler && <div class="fehler">Fehler: {schritt.fehler}</div>}
        </div>
      ) : (
        <p class="schwach">In dieser Sitzung noch nicht gefeuert.</p>
      )}
    </div>
  );
}

export function Logik({
  gewerk,
  dps,
  schritte,
  escSignal,
  darfSpeichern,
  darfAktivieren,
}: {
  gewerk: GewerkStruktur | null;
  dps: DatenpunktSicht[];
  schritte: Record<string, LetzterSchritt>;
  escSignal: number;
  darfSpeichern: boolean;
  darfAktivieren: boolean;
}) {
  const [seitenName, setSeitenName] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [editieren, setEditieren] = useState(false);
  const [kamera, setKamera] = useState({ x: 20, y: 20, zoom: 1 });
  const zeiger = useRef(new Map<number, { x: number; y: number }>());
  const geste = useRef<{ abstand: number; mitteX: number; mitteY: number } | null>(null);

  useEffect(() => setGewaehlt(null), [escSignal]);

  const seite =
    gewerk?.seiten.find((s) => s.name === seitenName) ?? gewerk?.seiten[0] ?? null;

  const manifeste = useMemo(() => {
    const m = new Map<string, { eingaenge: string[]; ausgaenge: string[] }>();
    for (const b of gewerk?.bausteine ?? []) m.set(b.id, b);
    return m;
  }, [gewerk]);

  const layout = useMemo(
    () => (seite ? baueLayout(seite, manifeste) : null),
    [seite, manifeste],
  );

  const dpWerte = useMemo(() => {
    const m = new Map<string, Wert | null>();
    for (const d of dps) m.set(d.schluessel, d.wert);
    return m;
  }, [dps]);

  if (!gewerk || !seite || !layout) {
    return <p class="schwach">Gewerk-Struktur lädt …</p>;
  }

  if (editieren) {
    return (
      <>
        <div class="werkzeuge">
          <button onClick={() => setEditieren(false)}>← Monitor</button>
          <span class="schwach">Logik-Editor v1 · Speichern schreibt die YAML-Datei, Aktivieren schaltet atomar um.</span>
        </div>
        <LogikEditor
          gewerk={gewerk}
          dps={dps}
          seiteKey={seite.name}
          darfSpeichern={darfSpeichern}
          darfAktivieren={darfAktivieren}
          setSeiteKey={(key) => {
            setSeitenName(key);
            setGewaehlt(null);
          }}
        />
      </>
    );
  }

  // Stubs entstehen im Import als lbs<FunctionId> (Verhalten = Portierungs-TODO)
  const istStub = (baustein?: string) => baustein !== undefined && /^lbs\d+$/.test(baustein);

  const jetzt = Date.now();
  const detailKnoten = layout.knoten.find((n) => n.id === gewaehlt && n.art === "baustein");
  const begrenzeZoom = (zoom: number): number => Math.min(2.5, Math.max(0.35, zoom));
  const zuruecksetzen = (): void => setKamera({ x: 20, y: 20, zoom: 1 });

  const zeigerStart = (event: PointerEvent): void => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    zeiger.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const zeigerBewegt = (event: PointerEvent): void => {
    const vorher = zeiger.current.get(event.pointerId);
    if (!vorher) return;
    zeiger.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const punkte = [...zeiger.current.values()];
    if (punkte.length === 1) {
      setKamera((alt) => ({ ...alt, x: alt.x + event.clientX - vorher.x, y: alt.y + event.clientY - vorher.y }));
      return;
    }
    const [a, b] = punkte;
    if (!a || !b) return;
    const abstand = Math.hypot(a.x - b.x, a.y - b.y);
    const mitteX = (a.x + b.x) / 2;
    const mitteY = (a.y + b.y) / 2;
    if (geste.current) {
      const faktor = abstand / Math.max(1, geste.current.abstand);
      setKamera((alt) => ({
        x: alt.x + mitteX - geste.current!.mitteX,
        y: alt.y + mitteY - geste.current!.mitteY,
        zoom: begrenzeZoom(alt.zoom * faktor),
      }));
    }
    geste.current = { abstand, mitteX, mitteY };
  };
  const zeigerEnde = (event: PointerEvent): void => {
    zeiger.current.delete(event.pointerId);
    geste.current = null;
  };
  const zoome = (event: WheelEvent): void => {
    event.preventDefault();
    const faktor = event.deltaY < 0 ? 1.12 : 0.89;
    setKamera((alt) => ({ ...alt, zoom: begrenzeZoom(alt.zoom * faktor) }));
  };

  return (
    <>
      <div class="werkzeuge">
        <select
          value={seite.name}
          onChange={(e) => {
            setSeitenName((e.target as HTMLSelectElement).value);
            setGewaehlt(null);
          }}
        >
          {gewerk.seiten.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.knoten.length} Knoten)
            </option>
          ))}
        </select>
        {seite.notizen && <span class="schwach logik-notiz">{seite.notizen}</span>}
        <span class="werkzeuge-trenner" />
        {(darfSpeichern || darfAktivieren) && <button class="primaer" onClick={() => setEditieren(true)}>Editieren</button>}
        <button onClick={() => setKamera((alt) => ({ ...alt, zoom: begrenzeZoom(alt.zoom / 1.2) }))} aria-label="Verkleinern">−</button>
        <span class="mono schwach">{Math.round(kamera.zoom * 100)}%</span>
        <button onClick={() => setKamera((alt) => ({ ...alt, zoom: begrenzeZoom(alt.zoom * 1.2) }))} aria-label="Vergrößern">+</button>
        <button onClick={zuruecksetzen}>Ansicht zurücksetzen</button>
      </div>

      {detailKnoten && (
        <Detail
          knoten={detailKnoten}
          seite={seite}
          schritt={schritte[`${seite.name}/${detailKnoten.id}`]}
          stub={istStub(detailKnoten.baustein)}
        />
      )}

      <div
        class="logik-huelle"
        onPointerDown={zeigerStart}
        onPointerMove={zeigerBewegt}
        onPointerUp={zeigerEnde}
        onPointerCancel={zeigerEnde}
        onWheel={zoome}
      >
        <div class="logik-canvas" style={{ transform: `translate(${kamera.x}px, ${kamera.y}px) scale(${kamera.zoom})` }}>
          <svg width={layout.breite} height={layout.hoehe} viewBox={`0 0 ${layout.breite} ${layout.hoehe}`} class="logik-svg">
          {layout.kanten.map((k, i) => {
            const wert = kantenWert(k, seite.name, dpWerte, schritte);
            const dx = Math.max(40, (k.x2 - k.x1) / 2);
            const pfad = `M ${k.x1} ${k.y1} C ${k.x1 + dx} ${k.y1}, ${k.x2 - dx} ${k.y2}, ${k.x2} ${k.y2}`;
            const an = wert === true || (typeof wert === "number" && wert !== 0);
            return (
              <g key={i}>
                <path d={pfad} class={`kante ${an ? "kante-an" : ""}`} />
                {wert !== undefined && wert !== null && (
                  <text
                    x={(k.x1 + k.x2) / 2}
                    y={(k.y1 + k.y2) / 2 - 4}
                    class="kante-wert"
                    text-anchor="middle"
                  >
                    {wertText(wert).slice(0, 12)}
                  </text>
                )}
              </g>
            );
          })}

          {layout.knoten.map((n) => {
            if (n.art === "dp") {
              return (
                <g key={n.id}>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={n.b}
                    height={n.h}
                    rx={n.h / 2}
                    class="dp-knoten"
                  />
                  <text x={n.x + n.b / 2} y={n.y + n.h / 2 + 4} text-anchor="middle" class="dp-text">
                    {n.id.length > 24 ? `…${n.id.slice(-23)}` : n.id}
                  </text>
                </g>
              );
            }
            const schritt = schritte[`${seite.name}/${n.id}`];
            const feuert = schritt !== undefined && jetzt - schritt.ts < 2000;
            const stub = istStub(n.baustein);
            return (
              <g key={n.id} onClick={() => setGewaehlt(n.id)} class="knoten-klick">
                <rect
                  x={n.x}
                  y={n.y}
                  width={n.b}
                  height={n.h}
                  rx={6}
                  class={`knoten ${feuert ? "knoten-feuert" : ""} ${stub ? "knoten-stub" : ""} ${
                    schritt?.fehler ? "knoten-fehler" : ""
                  } ${gewaehlt === n.id ? "knoten-gewaehlt" : ""}`}
                />
                <text x={n.x + n.b / 2} y={n.y + 15} text-anchor="middle" class="knoten-titel">
                  {n.baustein}
                  {stub ? " ⚠" : ""}
                </text>
                {n.eingaenge.map((p, i) => (
                  <text
                    key={`e${p}`}
                    x={n.x + 5}
                    y={n.y + KOPF_H + i * PORT_H + PORT_H / 2 + 4}
                    class="port-text"
                  >
                    {p}
                  </text>
                ))}
                {n.ausgaenge.map((p, i) => (
                  <text
                    key={`a${p}`}
                    x={n.x + n.b - 5}
                    y={n.y + KOPF_H + i * PORT_H + PORT_H / 2 + 4}
                    text-anchor="end"
                    class="port-text"
                  >
                    {p}
                  </text>
                ))}
              </g>
            );
          })}
          </svg>
        </div>
        <div class="logik-hinweis">Ziehen zum Verschieben · Mausrad oder Zwei-Finger-Geste zum Zoomen</div>
      </div>
    </>
  );
}
