import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type {
  VisuAktion,
  VisuDesign,
  VisuDesigns,
  VisuElement,
  VisuPlacement,
  VisuPreset,
  VisuSeite,
  VisuWidget,
} from "../../../schema/src/visu.ts";
import { ApiFehler, api, type DatenpunktSicht } from "../lib/api.ts";
import { designFuer, formatierterWert, lesbarerName, placementFuer, type WertEintrag } from "../visu/modell.ts";
import {
  bestaetigeSeitenwechsel,
  dupliziereElemente,
  fehlendeVisuEditorScopes,
  fuegeElementEin,
  loescheElemente,
  materialisierePlacement,
  sollDragHistorieMerken,
  skaliereElement,
  verschiebeElemente,
  type PaletteTyp,
} from "./visu-editor-modell.ts";
import { inhaltZumSpeichern } from "./visu-yaml.ts";

const PALETTE: Array<{ label: string; typ: PaletteTyp }> = [
  { label: "Taster", typ: { art: "preset", preset: "taster" } },
  { label: "Schalter", typ: { art: "preset", preset: "schalter" } },
  { label: "Status", typ: { art: "preset", preset: "statusanzeige" } },
  { label: "Wert", typ: { art: "preset", preset: "wertanzeige" } },
  { label: "Label", typ: { art: "preset", preset: "label" } },
  { label: "Symbol", typ: { art: "preset", preset: "symbol" } },
  { label: "Navigation", typ: { art: "preset", preset: "navigation" } },
  { label: "Slider", typ: { art: "widget", widget: "slider" } },
  { label: "Diagramm", typ: { art: "widget", widget: "diagramm" } },
];

type Meldung = { ton: "ok" | "warn" | "fehler"; text: string };
type Griff = "move" | "resize";

interface DragStart {
  key: string;
  art: Griff;
  x: number;
  y: number;
  seite: VisuSeite;
  keys: string[];
  historieGemerk: boolean;
}

interface AuswahlRahmen {
  startX: number;
  startY: number;
  x: number;
  y: number;
}

function leereSeite(name = "Neue Seite"): VisuSeite {
  return {
    typ: "seite",
    name,
    basis: "tablet",
    groessen: {
      tablet: { w: 1280, h: 800 },
      handy: { w: 390, h: 844 },
    },
    elemente: {},
  };
}

function dateiPfad(seiteKey: string): string {
  return `visu/seiten/${seiteKey}.yaml`;
}

function ersterSeitenKey(seiten: Record<string, VisuSeite>): string | null {
  return Object.keys(seiten).filter((key) => seiten[key]?.typ === "seite").sort()[0] ?? null;
}

function clone(seite: VisuSeite): VisuSeite {
  return structuredClone(seite);
}

function designStil(design: VisuDesign): JSX.CSSProperties {
  return {
    ...(design.hintergrund ? { background: design.hintergrund } : {}),
    ...(design.text ? { color: design.text } : {}),
    ...(design.rand?.farbe ? { borderColor: design.rand.farbe } : {}),
    ...(design.rand?.radius !== undefined ? { borderRadius: design.rand.radius } : {}),
    ...(design.schriftgroesse !== undefined ? { fontSize: design.schriftgroesse } : {}),
  };
}

function elementText(key: string, element: VisuElement, werte: ReadonlyMap<string, WertEintrag>, placement: VisuPlacement): string {
  const wertKey = element.bindungen?.display ?? element.bindungen?.status;
  const wert = formatierterWert(wertKey, werte, element.format, placement.format);
  if (element.preset === "navigation") return `${lesbarerName(key)} ->`;
  if (element.preset === "schalter") return `${lesbarerName(key)} ${wert || "Aus"}`;
  if (element.widget === "slider") return `${lesbarerName(key)} ${wert}`;
  if (element.widget === "diagramm") return `${lesbarerName(key)} Verlauf`;
  return wert || lesbarerName(key);
}

function typLabel(element: VisuElement): string {
  return element.preset ?? element.widget ?? "element";
}

function paletteDaten(typ: PaletteTyp): string {
  return typ.art === "preset" ? `preset:${typ.preset}` : `widget:${typ.widget}`;
}

function paletteAusDaten(text: string): PaletteTyp | null {
  const [art, wert] = text.split(":");
  if (art === "preset") return { art, preset: wert as VisuPreset };
  if (art === "widget") return { art, widget: wert as VisuWidget };
  return null;
}

function useHistory(resetKey: string | null) {
  const [vergangenheit, setVergangenheit] = useState<VisuSeite[]>([]);
  const [zukunft, setZukunft] = useState<VisuSeite[]>([]);

  useEffect(() => {
    setVergangenheit([]);
    setZukunft([]);
  }, [resetKey]);

  return {
    kannUndo: vergangenheit.length > 0,
    kannRedo: zukunft.length > 0,
    merke(vorher: VisuSeite): void {
      setVergangenheit((alt) => [...alt.slice(-39), clone(vorher)]);
      setZukunft([]);
    },
    undo(aktuell: VisuSeite, setze: (seite: VisuSeite) => void): void {
      const vorher = vergangenheit.at(-1);
      if (!vorher) return;
      setVergangenheit((alt) => alt.slice(0, -1));
      setZukunft((alt) => [clone(aktuell), ...alt].slice(0, 40));
      setze(clone(vorher));
    },
    redo(aktuell: VisuSeite, setze: (seite: VisuSeite) => void): void {
      const naechste = zukunft[0];
      if (!naechste) return;
      setZukunft((alt) => alt.slice(1));
      setVergangenheit((alt) => [...alt, clone(aktuell)].slice(-40));
      setze(clone(naechste));
    },
  };
}

function AuswahlEigenschaften({
  seite,
  breakpoint,
  auswahl,
  designs,
  dps,
  aendere,
}: {
  seite: VisuSeite;
  breakpoint: string;
  auswahl: string[];
  designs: VisuDesigns;
  dps: DatenpunktSicht[];
  aendere: (mutator: (seite: VisuSeite) => void) => void;
}) {
  const key = auswahl.length === 1 ? auswahl[0] : null;
  const element = key ? seite.elemente[key] : undefined;
  const placement = key && element ? placementFuer(element, breakpoint, seite.basis) : undefined;
  const hatEigenesPlacement = Boolean(key && element?.placements?.[breakpoint]);
  const [dpFilter, setDpFilter] = useState("");
  const datenpunkte = dps.filter((dp) =>
    !dpFilter
    || dp.schluessel.toLowerCase().includes(dpFilter.toLowerCase())
    || dp.name.toLowerCase().includes(dpFilter.toLowerCase()),
  ).slice(0, 40);

  if (!key || !element || !placement) {
    return (
      <aside class="editor-panel editor-eigenschaften">
        <h2>Eigenschaften</h2>
        <div class="leerzustand"><strong>{auswahl.length || "Kein"} Element(e)</strong><span>Element auf der Leinwand wählen.</span></div>
      </aside>
    );
  }

  const setBindung = (rolle: string, wert: string): void => aendere((entwurf) => {
    const e = entwurf.elemente[key];
    if (!e) return;
    e.bindungen ??= {};
    if (wert) e.bindungen[rolle] = wert;
    else delete e.bindungen[rolle];
    if (Object.keys(e.bindungen).length === 0) delete e.bindungen;
  });
  const setPlacement = (feld: keyof VisuPlacement, wert: number | boolean | undefined): void => aendere((entwurf) => {
    const p = materialisierePlacement(entwurf, key, breakpoint);
    if (!p) return;
    if (wert === undefined) delete p[feld];
    else (p as Record<string, unknown>)[feld] = wert;
  });
  const setAktionText = (text: string): void => aendere((entwurf) => {
    const e = entwurf.elemente[key];
    if (!e) return;
    if (!text) {
      delete e.aktionen;
      return;
    }
    if (text === "umschalten") e.aktionen = { kurz: { art: "umschalten" } };
    else if (text.startsWith("setze:")) {
      const roh = text.slice("setze:".length).trim();
      e.aktionen = { kurz: { setze: roh === "true" ? true : roh === "false" ? false : Number.isFinite(Number(roh)) ? Number(roh) : roh } };
    } else {
      e.aktionen = { kurz: { seite: text } };
    }
  });
  const aktionsText = (aktion: VisuAktion | undefined): string => {
    if (!aktion) return "";
    if ("art" in aktion) return "umschalten";
    if ("setze" in aktion) return `setze:${String(aktion.setze)}`;
    if ("seite" in aktion) return aktion.seite;
    return `popup:${aktion.popup}`;
  };

  return (
    <aside class="editor-panel editor-eigenschaften">
      <h2>Eigenschaften</h2>
      <label>Element<input value={key} disabled /></label>
      <label>Typ<input value={typLabel(element)} disabled /></label>
      <label>Design
        <select value={element.design ?? ""} onChange={(event) => aendere((entwurf) => {
          const e = entwurf.elemente[key];
          if (!e) return;
          const wert = (event.target as HTMLSelectElement).value;
          if (wert) e.design = wert;
          else delete e.design;
        })}>
          <option value="">Kein Design</option>
          {Object.keys(designs).sort().map((design) => <option key={design} value={design}>{design}</option>)}
        </select>
      </label>
      <label>Datenpunkt suchen<input value={dpFilter} placeholder="Name oder Schlüssel" onInput={(event) => setDpFilter((event.target as HTMLInputElement).value)} /></label>
      <datalist id="editor-datenpunkte">
        {datenpunkte.map((dp) => <option key={dp.schluessel} value={dp.schluessel}>{dp.name}</option>)}
      </datalist>
      <label>display<input list="editor-datenpunkte" value={element.bindungen?.display ?? ""} onInput={(event) => setBindung("display", (event.target as HTMLInputElement).value)} /></label>
      <label>set<input list="editor-datenpunkte" value={element.bindungen?.set ?? ""} onInput={(event) => setBindung("set", (event.target as HTMLInputElement).value)} /></label>
      <label>status<input list="editor-datenpunkte" value={element.bindungen?.status ?? ""} onInput={(event) => setBindung("status", (event.target as HTMLInputElement).value)} /></label>
      <label>Aktion<input value={aktionsText(Object.values(element.aktionen ?? {})[0])} placeholder="umschalten, setze:true, seite" onInput={(event) => setAktionText((event.target as HTMLInputElement).value)} /></label>
      <label class="editor-check"><input type="checkbox" checked={placement.sichtbar !== false} onChange={(event) => setPlacement("sichtbar", (event.target as HTMLInputElement).checked ? undefined : false)} /> Sichtbar auf {breakpoint}</label>
      <details>
        <summary>Erweitert</summary>
        <div class="editor-grid2">
          <label>x<input type="number" value={placement.x ?? 0} onInput={(event) => setPlacement("x", Number((event.target as HTMLInputElement).value))} /></label>
          <label>y<input type="number" value={placement.y ?? 0} onInput={(event) => setPlacement("y", Number((event.target as HTMLInputElement).value))} /></label>
          <label>w<input type="number" value={placement.w ?? 0} onInput={(event) => setPlacement("w", Number((event.target as HTMLInputElement).value))} /></label>
          <label>h<input type="number" value={placement.h ?? 0} onInput={(event) => setPlacement("h", Number((event.target as HTMLInputElement).value))} /></label>
        </div>
        {!hatEigenesPlacement && <p class="schwach">Geerbt von {seite.basis}; erste Änderung materialisiert das Placement.</p>}
      </details>
    </aside>
  );
}

export function VisuEditor({ dps }: { dps: DatenpunktSicht[] }) {
  const [seiten, setSeiten] = useState<Record<string, VisuSeite>>({});
  const [designs, setDesigns] = useState<VisuDesigns>({});
  const [seiteKey, setSeiteKey] = useState<string | null>(null);
  const [seite, setSeite] = useState<VisuSeite | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [breakpoint, setBreakpoint] = useState("tablet");
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [raster, setRaster] = useState(10);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [readonlyGrund, setReadonlyGrund] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragStart | null>(null);
  const [rahmen, setRahmen] = useState<AuswahlRahmen | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const history = useHistory(seiteKey);
  const werte = useMemo(
    () => new Map(dps.map((dp) => [dp.schluessel, { wert: dp.wert, ...(dp.format ? { format: dp.format } : {}) }])),
    [dps],
  );

  useEffect(() => {
    let aktiv = true;
    void api.ich()
      .then((antwort) => {
        if (!aktiv) return;
        const fehlend = fehlendeVisuEditorScopes(antwort.scopes);
        if (fehlend.length > 0) setReadonlyGrund(`Token ohne Schreib-/Aktivier-Scope: ${fehlend.join(", ")}`);
      })
      .catch(() => {
        if (aktiv) setReadonlyGrund("Berechtigungen konnten nicht gelesen werden.");
      });
    void api.visu<{ seiten: Record<string, VisuSeite>; designs: VisuDesigns }>()
      .then((antwort) => {
        if (!aktiv) return;
        setSeiten(antwort.seiten);
        setDesigns(antwort.designs);
        setSeiteKey(ersterSeitenKey(antwort.seiten));
        setMeldung(null);
      })
      .catch((error: unknown) => setMeldung({ ton: "fehler", text: error instanceof Error ? error.message : String(error) }));
    return () => { aktiv = false; };
  }, []);

  useEffect(() => {
    if (!seiteKey) return;
    let aktiv = true;
    const ausApi = seiten[seiteKey] ? clone(seiten[seiteKey]) : leereSeite(lesbarerName(seiteKey));
    setSeite(ausApi);
    setBreakpoint(ausApi.basis);
    setAuswahl([]);
    setDirty(false);
    setRaw(null);
    void api.gewerkDatei(dateiPfad(seiteKey))
      .then((antwort) => {
        if (aktiv) setRaw(antwort.inhalt);
      })
      .catch(() => {
        if (aktiv) setRaw(null);
      });
    return () => { aktiv = false; };
  }, [seiteKey, seiten]);

  const setzeMitHistorie = (naechste: VisuSeite, auswahlNeu = auswahl): void => {
    if (!seite) return;
    history.merke(seite);
    setSeite(naechste);
    setAuswahl(auswahlNeu);
    setDirty(true);
  };
  const aendere = (mutator: (seite: VisuSeite) => void): void => {
    if (!seite) return;
    const entwurf = clone(seite);
    mutator(entwurf);
    setzeMitHistorie(entwurf);
  };
  const canvas = seite?.groessen[breakpoint] ?? null;

  const canvasPunkt = (event: MouseEvent | PointerEvent | DragEvent): { x: number; y: number } => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: Math.max(0, event.clientX - (rect?.left ?? 0)), y: Math.max(0, event.clientY - (rect?.top ?? 0)) };
  };

  const speichere = async (): Promise<void> => {
    if (!seite || !seiteKey || readonlyGrund) return;
    const inhalt = inhaltZumSpeichern(seite, raw, dirty);
    try {
      const antwort = await api.schreibeGewerkDatei(dateiPfad(seiteKey), inhalt);
      setRaw(inhalt);
      setDirty(false);
      setReadonlyGrund(null);
      setMeldung({ ton: "ok", text: `Gespeichert: ${antwort.pfad ?? dateiPfad(seiteKey)}` });
    } catch (error) {
      const grund = error instanceof Error ? error.message : String(error);
      if (error instanceof ApiFehler && (error.status === 401 || error.status === 403)) setReadonlyGrund(grund);
      setMeldung({ ton: "fehler", text: grund });
    }
  };

  const aktiviere = async (): Promise<void> => {
    if (readonlyGrund) return;
    try {
      const antwort = await api.aktiviereGewerk();
      setReadonlyGrund(null);
      setMeldung({ ton: "ok", text: `Aktiviert in ${antwort.dauerMs ?? 0} ms` });
    } catch (error) {
      const grund = error instanceof ApiFehler && Array.isArray(error.koerper.fehler)
        ? error.koerper.fehler.join(" | ")
        : error instanceof Error ? error.message : String(error);
      if (error instanceof ApiFehler && (error.status === 401 || error.status === 403)) setReadonlyGrund(grund);
      setMeldung({ ton: "fehler", text: grund });
    }
  };

  const neueSeite = (): void => {
    if (!bestaetigeSeitenwechsel(dirty, () => globalThis.confirm("Ungespeicherte Änderungen verwerfen und eine neue Seite anlegen?"))) return;
    const key = `seite_${Object.keys(seiten).length + 1}`;
    const neu = leereSeite(`Seite ${Object.keys(seiten).length + 1}`);
    setSeiten((alt) => ({ ...alt, [key]: neu }));
    setSeiteKey(key);
    setRaw(null);
    setDirty(true);
  };

  const fuegePaletteEin = (typ: PaletteTyp, x = 40, y = 40): void => {
    if (!seite) return;
    const erg = fuegeElementEin(seite, typ, breakpoint, x, y, raster);
    setzeMitHistorie(erg.seite, [erg.key]);
  };

  const richteAus = (modus: "links" | "oben"): void => {
    if (!seite || auswahl.length < 2) return;
    const referenz = placementFuer(seite.elemente[auswahl[0]!]!, breakpoint, seite.basis);
    if (!referenz) return;
    aendere((entwurf) => {
      for (const key of auswahl) {
        const p = materialisierePlacement(entwurf, key, breakpoint);
        if (!p) continue;
        if (modus === "links" && referenz.x !== undefined) p.x = referenz.x;
        else if (modus === "oben" && referenz.y !== undefined) p.y = referenz.y;
      }
    });
  };

  if (!seite || !canvas) {
    return <div class="leerzustand"><strong>Visu-Editor lädt</strong><span>Seiten und Designs werden gelesen.</span></div>;
  }

  return (
    <div class="visu-editor">
      <div class="werkzeuge editor-toolbar">
        <select value={seiteKey ?? ""} aria-label="Visu-Seite" onChange={(event) => {
          const ziel = (event.target as HTMLSelectElement).value;
          if (ziel === seiteKey) return;
          if (!bestaetigeSeitenwechsel(dirty, () => globalThis.confirm("Ungespeicherte Änderungen verwerfen und Seite wechseln?"))) return;
          setSeiteKey(ziel);
        }}>
          {Object.keys(seiten).sort().map((key) => <option key={key} value={key}>{key}</option>)}
        </select>
        <button onClick={neueSeite}>Neue Seite</button>
        <div class="segment" role="group" aria-label="Breakpoint">
          {Object.keys(seite.groessen).sort().map((key) => (
            <button key={key} aria-pressed={breakpoint === key} onClick={() => setBreakpoint(key)}>{key}</button>
          ))}
        </div>
        <label class="editor-raster">Raster<input type="number" min="1" max="80" value={raster} onInput={(event) => setRaster(Math.max(1, Number((event.target as HTMLInputElement).value) || 1))} /></label>
        <button disabled={!history.kannUndo} onClick={() => history.undo(seite, (s) => { setSeite(s); setDirty(true); })}>↶</button>
        <button disabled={!history.kannRedo} onClick={() => history.redo(seite, (s) => { setSeite(s); setDirty(true); })}>↷</button>
        <button disabled={auswahl.length < 2} onClick={() => richteAus("links")}>Links</button>
        <button disabled={auswahl.length < 2} onClick={() => richteAus("oben")}>Oben</button>
        <button disabled={auswahl.length === 0} onClick={() => {
          const erg = dupliziereElemente(seite, auswahl, breakpoint, raster);
          setzeMitHistorie(erg.seite, erg.keys);
        }}>Duplizieren</button>
        <button disabled={auswahl.length === 0} onClick={() => setzeMitHistorie(loescheElemente(seite, auswahl), [])}>Löschen</button>
        <span class="werkzeuge-trenner" />
        {readonlyGrund && <span class="warn-chip" title={readonlyGrund}>Read-only</span>}
        <button class="primaer" disabled={Boolean(readonlyGrund)} onClick={() => void speichere()}>{dirty ? "Speichern*" : "Speichern"}</button>
        <button disabled={Boolean(readonlyGrund)} onClick={() => void aktiviere()}>Aktivieren</button>
      </div>
      {meldung && <div class={`editor-meldung ${meldung.ton}`} role="status">{meldung.text}</div>}
      <div class="editor-layout">
        <aside class="editor-panel editor-palette">
          <h2>Palette</h2>
          {PALETTE.map((eintrag) => (
            <button
              key={eintrag.label}
              draggable
              onDragStart={(event) => event.dataTransfer?.setData("text/plain", paletteDaten(eintrag.typ))}
              onClick={() => fuegePaletteEin(eintrag.typ)}
            >
              {eintrag.label}
            </button>
          ))}
          <p class="schwach">Ziehen erzeugt ein Element auf der Leinwand; Klick legt es oben links an.</p>
        </aside>
        <div class="editor-canvas-huelle">
          <div
            ref={canvasRef}
            class="editor-canvas"
            style={{ width: canvas.w, height: canvas.h }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const typ = paletteAusDaten(event.dataTransfer?.getData("text/plain") ?? "");
              if (!typ) return;
              const punkt = canvasPunkt(event);
              fuegePaletteEin(typ, punkt.x, punkt.y);
            }}
            onPointerDown={(event) => {
              if (!event.shiftKey) return;
              const punkt = canvasPunkt(event);
              setRahmen({ startX: punkt.x, startY: punkt.y, x: punkt.x, y: punkt.y });
            }}
            onPointerMove={(event) => {
              if (rahmen) {
                const punkt = canvasPunkt(event);
                setRahmen({ ...rahmen, x: punkt.x, y: punkt.y });
              }
              if (!drag) return;
              const dx = event.clientX - drag.x;
              const dy = event.clientY - drag.y;
              if (dx === 0 && dy === 0) return;
              if (sollDragHistorieMerken(drag.historieGemerk, dx, dy)) {
                history.merke(drag.seite);
                setDrag({ ...drag, historieGemerk: true });
              }
              setSeite(drag.art === "resize"
                ? skaliereElement(drag.seite, drag.key, breakpoint, dx, dy, raster)
                : verschiebeElemente(drag.seite, drag.keys, breakpoint, dx, dy, raster));
              setDirty(true);
            }}
            onPointerUp={() => {
              if (rahmen) {
                const x1 = Math.min(rahmen.startX, rahmen.x);
                const x2 = Math.max(rahmen.startX, rahmen.x);
                const y1 = Math.min(rahmen.startY, rahmen.y);
                const y2 = Math.max(rahmen.startY, rahmen.y);
                setAuswahl(Object.entries(seite.elemente).filter(([, element]) => {
                  const p = placementFuer(element, breakpoint, seite.basis);
                  if (!p) return false;
                  return (p.x ?? 0) < x2 && (p.x ?? 0) + (p.w ?? 0) > x1 && (p.y ?? 0) < y2 && (p.y ?? 0) + (p.h ?? 0) > y1;
                }).map(([key]) => key));
              }
              setRahmen(null);
              setDrag(null);
            }}
          >
            {Object.entries(seite.elemente).map(([key, element]) => {
              const placement = placementFuer(element, breakpoint, seite.basis);
              if (!placement) return null;
              const eigen = Boolean(element.placements?.[breakpoint]);
              const gewaehlt = auswahl.includes(key);
              const statusKey = element.bindungen?.status;
              const status = statusKey ? werte.get(statusKey)?.wert : undefined;
              const stil = designStil(designFuer(element, designs, status));
              return (
                <div
                  key={key}
                  class={`editor-element ${gewaehlt ? "gewaehlt" : ""} ${eigen ? "" : "geerbt"} ${placement.sichtbar === false ? "verborgen" : ""}`}
                  style={{
                    left: placement.x ?? 0,
                    top: placement.y ?? 0,
                    width: placement.w ?? 0,
                    height: placement.h ?? 0,
                    zIndex: element.ebene ?? 0,
                    ...stil,
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const neueAuswahl = event.shiftKey
                      ? (gewaehlt ? auswahl.filter((k) => k !== key) : [...auswahl, key])
                      : (gewaehlt ? auswahl : [key]);
                    setAuswahl(neueAuswahl);
                    setDrag({ key, art: "move", x: event.clientX, y: event.clientY, seite: clone(seite), keys: neueAuswahl, historieGemerk: false });
                  }}
                >
                  <span class="editor-element-typ">{typLabel(element)}</span>
                  <strong>{elementText(key, element, werte, placement)}</strong>
                  {gewaehlt && (
                    <button
                      class="editor-griff"
                      aria-label="Skalieren"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setDrag({ key, art: "resize", x: event.clientX, y: event.clientY, seite: clone(seite), keys: [key], historieGemerk: false });
                      }}
                    />
                  )}
                </div>
              );
            })}
            {rahmen && (
              <div
                class="editor-auswahlrahmen"
                style={{
                  left: Math.min(rahmen.startX, rahmen.x),
                  top: Math.min(rahmen.startY, rahmen.y),
                  width: Math.abs(rahmen.x - rahmen.startX),
                  height: Math.abs(rahmen.y - rahmen.startY),
                }}
              />
            )}
          </div>
        </div>
        <AuswahlEigenschaften
          seite={seite}
          breakpoint={breakpoint}
          auswahl={auswahl}
          designs={designs}
          dps={dps}
          aendere={aendere}
        />
      </div>
    </div>
  );
}
