import { render, type ComponentChildren, type JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type {
  VisuAktion,
  VisuDesign,
  VisuDesigns,
  VisuElement,
  VisuPlacement,
  VisuSeite,
} from "../../../schema/src/visu.ts";
import "../lib/stil.css";
import "./visu.css";
import { ApiFehler, api, setzeAuthErforderlichHandler, verbindeLive, type DatenpunktSicht, type IchAntwort, type LiveNachricht, type Wert } from "../lib/api.ts";
import { hatScope, type AuthStatus } from "../lib/auth.ts";
import { LoginAnsicht } from "../lib/login.tsx";
import { Diagramm } from "../lib/diagramm.tsx";
import { statusSchluesselFuerAktion, wertAusAktion, wertPasstZumDatenpunkt } from "./bedienen.ts";
import { ladeVisuDaten, type VisuAntwort } from "./client.ts";
import { VisuIcon } from "./icons.tsx";
import {
  designFuer,
  elementAnzeige,
  farbwertFuerPixel,
  beschriftungFuerElement,
  einzelnesPrivatesSymbol,
  fachwerkKachelFuer,
  fontFaceCssFuerSchriften,
  navigationZeigtPfeil,
  groesseFuerPlacement,
  placementFuer,
  reglerKonfiguration,
  reglerSchreibwert,
  reglerWertFuerWinkel,
  renderElementeFuerSeite,
  schiebeschalterZustand,
  schriftartenAusDesigns,
  seitenSkalierung,
  startSeite,
  winkelFuerReglerWert,
  waehleBreakpoint,
  type WertEintrag,
} from "./modell.ts";
import { designStil, grundstilFuerRenderSeite, grundstilStil, visuDateiUrl } from "./design.ts";

type LiveStatus = "verbindet" | "verbunden" | "getrennt";
type LiveWert = Extract<LiveNachricht, { art: "wert" }>;
type ToastTon = "info" | "warn" | "fehler";

interface Toast {
  id: number;
  text: string;
  ton: ToastTon;
}

interface BedienKontext {
  datenpunkte: ReadonlyMap<string, DatenpunktSicht>;
  gesperrt: ReadonlyMap<string, string>;
  pending: ReadonlySet<string>;
  slider: ReadonlyMap<string, number>;
  liveNachricht: LiveWert | null;
  darfBedienen: boolean;
  setzeSlider: (schluessel: string, wert: number | null) => void;
  bediene: (elementKey: string, element: VisuElement, wert?: Wert) => void;
}

const thema = new URLSearchParams(location.search).get("theme");
if (thema === "light" || thema === "dark") document.documentElement.dataset.theme = thema;

function viewport(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

function useViewport(): { w: number; h: number } {
  const [groesse, setGroesse] = useState(viewport);
  useEffect(() => {
    const aktualisiere = (): void => setGroesse(viewport());
    // Direkt nach dem Mount NOCHMAL messen: hat das Fenster beim ersten Render
    // noch keine Groesse (Hintergrund-Tab, PWA-Start, eingebettetes Panel),
    // bliebe der Startwert sonst haengen — die Seite wird dann auf wenige
    // Pixel skaliert und erholt sich erst beim naechsten Fenster-Resize.
    aktualisiere();
    window.addEventListener("resize", aktualisiere);
    // Ein resize-Event feuert NICHT, wenn nur der Container seine Groesse
    // aendert (Split-Ansicht, eingebettete Visu). Der Beobachter deckt das ab.
    const beobachter = new ResizeObserver(aktualisiere);
    beobachter.observe(document.documentElement);
    return () => {
      window.removeEventListener("resize", aktualisiere);
      beobachter.disconnect();
    };
  }, []);
  return groesse;
}

function navigationsAktion(element: VisuElement): VisuAktion | undefined {
  return Object.values(element.aktionen ?? {}).find(
    (aktion) => "seite" in aktion || "popup" in aktion,
  );
}

function diagrammArchiv(element: VisuElement): string | undefined {
  const archiv = element.parameter?.["archiv"];
  return typeof archiv === "string" && archiv.length > 0 ? archiv : element.bindungen?.["display"];
}

function diagrammStunden(element: VisuElement): number {
  const stunden = element.parameter?.["stunden"];
  return typeof stunden === "number" && Number.isFinite(stunden) && stunden > 0 ? stunden : 24;
}

function MitSymbol({ element, label, children }: { element: VisuElement; label: string; children: ComponentChildren }) {
  if (!element.symbol) return <>{children}</>;
  return <><VisuIcon name={element.symbol} dekorativ={Boolean(label)} />{children}</>;
}

function Farbauswahl({ elementKey, element, design, bedien }: { elementKey: string; element: VisuElement; design: VisuDesign; bedien: BedienKontext }) {
  const bild = useRef<HTMLImageElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const setKey = element.bindungen?.["set"];
  const bedienbar = Boolean(setKey) && bedien.darfBedienen && !bedien.gesperrt.has(setKey!);
  const abtasten = (event: PointerEvent): string | number | undefined => {
    const quelle = bild.current;
    const feld = event.currentTarget as HTMLDivElement;
    if (!quelle || !quelle.complete || quelle.naturalWidth === 0) return undefined;
    const r = feld.getBoundingClientRect();
    const x = Math.min(r.width, Math.max(0, event.clientX - r.left));
    const y = Math.min(r.height, Math.max(0, event.clientY - r.top));
    const canvas = document.createElement("canvas");
    canvas.width = quelle.naturalWidth; canvas.height = quelle.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    try {
      ctx.drawImage(quelle, 0, 0);
      const d = ctx.getImageData(Math.min(quelle.naturalWidth - 1, Math.floor(x / r.width * quelle.naturalWidth)), Math.min(quelle.naturalHeight - 1, Math.floor(y / r.height * quelle.naturalHeight)), 1, 1).data;
      const wert = farbwertFuerPixel({ r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: d[3] ?? 0 }, element.parameter?.["modus"], typeof element.parameter?.["alpha_schwelle"] === "number" ? element.parameter["alpha_schwelle"] : 32);
      if (wert !== undefined) setCursor({ x: x / r.width * 100, y: y / r.height * 100 });
      return wert;
    } catch { return undefined; }
  };
  if (!design.bild) return null;
  const cursorGroesse = typeof element.parameter?.["cursor"] === "number" ? element.parameter["cursor"] : 24;
  return <div class={bedienbar ? "farbauswahl" : "farbauswahl farbauswahl-deaktiviert"} onPointerDown={(e) => { if (bedienbar) { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); abtasten(e); } }} onPointerMove={(e) => { if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) abtasten(e); }} onPointerUp={(e) => { const feld = e.currentTarget as HTMLDivElement; if (!bedienbar || !setKey || !feld.hasPointerCapture(e.pointerId)) return; const wert = abtasten(e); feld.releasePointerCapture(e.pointerId); if (wert !== undefined) bedien.bediene(elementKey, element, wert); }}>
    <img ref={bild} src={visuDateiUrl(design.bild)} alt="" draggable={false} />
    {cursor && cursorGroesse > 0 && <span class="farbauswahl-cursor" style={{ left: `${cursor.x}%`, top: `${cursor.y}%`, width: `${cursorGroesse}px`, height: `${cursorGroesse}px` }} />}
  </div>;
}

function ElementInhalt({
  elementKey,
  element,
  placement,
  werte,
  designs,
  design,
  bedien,
}: {
  elementKey: string;
  element: VisuElement;
  placement: VisuPlacement;
  werte: ReadonlyMap<string, WertEintrag>;
  designs: VisuDesigns;
  design: VisuDesign;
  bedien: BedienKontext;
}): ComponentChildren {
  const anzeige = elementAnzeige("client", elementKey, element, werte, placement, design);

  if (element.widget === "schiebeschalter") {
    const statusKey = element.bindungen?.["status"];
    const schalter = schiebeschalterZustand(element, designs, statusKey ? werte.get(statusKey)?.wert : undefined);
    return (
      <>
        <span class="schiebeschalter-beschriftung">{anzeige.label}</span>
        {schalter.knopf && (
          <span
            class="schiebeschalter-knopf"
            style={{
              ...(schalter.knopfGroesse
                ? {
                  width: `${schalter.knopfGroesse.b}px`,
                  height: `${schalter.knopfGroesse.h}px`,
                  transform: `translate(${schalter.knopfVersatz?.x ?? 0}px, ${schalter.knopfVersatz?.y ?? 0}px)`,
                }
                : {
                  width: `${schalter.knopfAnteil}%`,
                  transform: `translateX(${schalter.knopfLinks ? 0 : 100 - schalter.knopfAnteil}%)`,
                }),
              transitionDuration: `${schalter.dauerMs}ms`,
              ...designStil(schalter.knopf),
            }}
          />
        )}
      </>
    );
  }

  if (element.widget === "farbauswahl") return <Farbauswahl elementKey={elementKey} element={element} design={design} bedien={bedien} />;
  if (element.widget === "regler") {
    const setKey = element.bindungen?.["set"];
    const konfiguration = reglerKonfiguration(element);
    const entwurf = setKey ? bedien.slider.get(setKey) : undefined;
    const wert = entwurf ?? (typeof anzeige.rohwert === "number" ? anzeige.rohwert : konfiguration.min);
    const winkel = winkelFuerReglerWert(wert, konfiguration);
    const deaktiviert = !setKey || !bedien.darfBedienen || (setKey ? bedien.gesperrt.has(setKey) : false);
    const punkt = (event: PointerEvent): number => {
      const feld = event.currentTarget as SVGSVGElement;
      const rechteck = feld.getBoundingClientRect();
      const x = event.clientX - rechteck.left - rechteck.width / 2;
      const y = event.clientY - rechteck.top - rechteck.height / 2;
      return Math.atan2(x, -y) * 180 / Math.PI + (Math.atan2(x, -y) < 0 ? 360 : 0);
    };
    const aktualisiere = (event: PointerEvent): number => {
      const neu = reglerWertFuerWinkel(punkt(event), konfiguration);
      if (setKey) bedien.setzeSlider(setKey, neu);
      return neu;
    };
    return (
      <div class="regler-inhalt">
        <svg
          class="regler-kreis"
          viewBox="0 0 100 100"
          aria-label={anzeige.label || "Regler"}
          role="slider"
          aria-valuemin={konfiguration.min}
          aria-valuemax={konfiguration.max}
          aria-valuenow={wert}
          onPointerDown={(event) => { if (!deaktiviert) { const feld = event.currentTarget as SVGSVGElement; feld.dataset["reglerStartwert"] = String(wert); feld.setPointerCapture(event.pointerId); aktualisiere(event); } }}
          onPointerMove={(event) => { if (!deaktiviert && (event.currentTarget as SVGSVGElement).hasPointerCapture(event.pointerId)) aktualisiere(event); }}
          onPointerUp={(event) => {
            const feld = event.currentTarget as SVGSVGElement;
            if (!setKey || deaktiviert || !feld.hasPointerCapture(event.pointerId)) return;
            const zielwert = aktualisiere(event);
            feld.releasePointerCapture(event.pointerId);
            bedien.setzeSlider(setKey, null);
            const startwert = Number(feld.dataset["reglerStartwert"]);
            delete feld.dataset["reglerStartwert"];
            bedien.bediene(elementKey, element, reglerSchreibwert(element.parameter?.["art"], Number.isFinite(startwert) ? startwert : wert, zielwert));
          }}
        >
          <circle class="regler-bogen" cx="50" cy="50" r="42" />
          <line class="regler-marke" x1="50" y1="50" x2="50" y2="12" transform={`rotate(${winkel} 50 50)`} />
          <circle class="regler-knopf" cx="50" cy="50" r={konfiguration.knopfAnteil * 0.22} />
        </svg>
        <strong>{anzeige.wert || String(wert)}</strong>
      </div>
    );
  }

  if (element.widget === "slider") {
    const setKey = element.bindungen?.["set"];
    const min = typeof element.parameter?.["min"] === "number" ? element.parameter["min"] : 0;
    const max = typeof element.parameter?.["max"] === "number" ? element.parameter["max"] : 100;
    const entwurf = setKey ? bedien.slider.get(setKey) : undefined;
    const zahl = entwurf ?? (typeof anzeige.rohwert === "number" ? anzeige.rohwert : min);
    const gesperrt = setKey ? bedien.gesperrt.get(setKey) : undefined;
    const deaktiviert = !setKey || !bedien.darfBedienen || gesperrt !== undefined;
    return (
      <div class="slider-inhalt">
        <span>{anzeige.label}</span>
        <input
          aria-label={anzeige.label}
          type="range"
          min={min}
          max={max}
          value={zahl}
          disabled={deaktiviert}
          title={!bedien.darfBedienen ? "Scope operate fehlt" : gesperrt}
          onInput={(event) => {
            if (!setKey) return;
            bedien.setzeSlider(setKey, Number((event.target as HTMLInputElement).value));
          }}
          onPointerUp={(event) => {
            if (!setKey) return;
            const zielwert = Number((event.target as HTMLInputElement).value);
            bedien.setzeSlider(setKey, null);
            bedien.bediene(elementKey, element, zielwert);
          }}
          onKeyUp={(event) => {
            if (!setKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            const zielwert = Number((event.target as HTMLInputElement).value);
            bedien.setzeSlider(setKey, null);
            bedien.bediene(elementKey, element, zielwert);
          }}
        />
        <strong>{anzeige.wert}</strong>
      </div>
    );
  }

  if (element.widget === "diagramm") {
    return (
      <>
        {/* Beschriftung nur, wenn sie gepflegt ist. Der Schlüssel-Fallback
            waere hier eine NEUE Kopfzeile ueber jedem bestehenden Diagramm —
            und ein technischer Schluessel ist genau das, was B8 loswird. */}
        {anzeige.hatText && <span class="element-name">{anzeige.label}</span>}
        <Diagramm
          archivId={diagrammArchiv(element)}
          startStunden={diagrammStunden(element)}
          liveNachricht={bedien.liveNachricht}
          klasse="diagramm-visu"
        />
      </>
    );
  }

  switch (element.preset) {
    case "symbol":
      return element.symbol
        ? <span class="symbol" aria-label={anzeige.label || undefined}><VisuIcon name={element.symbol} dekorativ={Boolean(anzeige.label)} /></span>
        : <span class="symbol" aria-label={anzeige.label}>{design.icon ?? (anzeige.hatText ? anzeige.label : anzeige.rohwert ? "●" : "○")}</span>;
    case "label":
      return <MitSymbol element={element} label={anzeige.label}><span>{anzeige.hatText ? anzeige.label : anzeige.wert || anzeige.label}</span></MitSymbol>;
    case "wertanzeige":
      // Etikett nur, wenn es gepflegt ist. Eine reine Messwert-Kachel traegt
      // im Original oft gar keine Beschriftung (die steht als eigenes Label
      // daneben) — der Schluessel-Fallback waere dort erfundene Zierde.
      return <MitSymbol element={element} label={anzeige.label}><>{anzeige.hatText && <span class="element-name">{anzeige.label}</span>}<strong class="element-wert">{anzeige.wert || "—"}</strong></></MitSymbol>;
    case "statusanzeige":
      return <MitSymbol element={element} label={anzeige.label}><><span class="status-punkt" aria-hidden="true" /> <span class="element-name">{anzeige.label}</span>{anzeige.hatWert && anzeige.wertAngefordert && <strong class="element-wert">{anzeige.wert || "—"}</strong>}</></MitSymbol>;
    case "schalter":
      return <MitSymbol element={element} label={anzeige.label}><><span>{anzeige.label}</span>{anzeige.wertAngefordert && <strong>{anzeige.wert || (anzeige.rohwert ? "An" : "Aus")}</strong>}</></MitSymbol>;
    case "taster":
      return <MitSymbol element={element} label={anzeige.label}><span>{anzeige.label}</span></MitSymbol>;
    case "navigation":
      return <MitSymbol element={element} label={anzeige.label}><span>{anzeige.label}{navigationZeigtPfeil(anzeige.label, design) && <> <span aria-hidden="true">→</span></>}</span></MitSymbol>;
    default:
      return <MitSymbol element={element} label={anzeige.label}><span>{anzeige.hatText ? anzeige.label : anzeige.wert || anzeige.label}</span></MitSymbol>;
  }
}

function VisuElementAnsicht({
  elementKey,
  element,
  placement,
  designs,
  werte,
  onAktion,
  bedien,
  zIndex,
  grundstil,
}: {
  elementKey: string;
  element: VisuElement;
  placement: VisuPlacement;
  designs: VisuDesigns;
  werte: ReadonlyMap<string, WertEintrag>;
  onAktion: (aktion: VisuAktion) => void;
  bedien: BedienKontext;
  zIndex: number;
  grundstil: JSX.CSSProperties;
}) {
  const statusKey = element.bindungen?.["status"];
  const status = statusKey ? werte.get(statusKey)?.wert : undefined;
  const schiebeschalter = element.widget === "schiebeschalter"
    ? schiebeschalterZustand(element, designs, status)
    : undefined;
  const design = schiebeschalter?.flaeche ?? designFuer(element, designs, status);
  const aktion = navigationsAktion(element);
  const setKey = element.bindungen?.["set"];
  const sperrgrund = setKey ? bedien.gesperrt.get(setKey) : undefined;
  const pending = setKey ? bedien.pending.has(setKey) : false;
  const hatSet = setKey !== undefined;
  const kachel = schiebeschalter ? false : fachwerkKachelFuer(element, design);
  const einzelSymbol = einzelnesPrivatesSymbol(beschriftungFuerElement(element, design)) || einzelnesPrivatesSymbol(design.icon);
  const stil: JSX.CSSProperties = {
    left: placement.x ?? 0,
    top: placement.y ?? 0,
    ...groesseFuerPlacement(element, designs, status, placement),
    zIndex,
    ...grundstil,
    ...designStil(design),
  };
  const inhalt = (
    <ElementInhalt
      elementKey={elementKey}
      element={element}
      placement={placement}
      werte={werte}
      designs={designs}
      design={design}
      bedien={bedien}
    />
  );
  const klassen = [
    "visu-element",
    sperrgrund ? "visu-element-deaktiviert" : "",
    pending ? "visu-element-gedrueckt" : "",
  ].filter(Boolean).join(" ");
  const titel = hatSet && !bedien.darfBedienen ? "Scope operate fehlt" : sperrgrund;

  if (
    element.widget === "diagramm" || element.widget === "slider" ||
    element.widget === "farbauswahl" || element.widget === "regler"
  ) {
    return (
      <div
        class={klassen}
        style={stil}
        title={titel}
        data-preset={element.preset ?? element.widget}
        data-pending={pending ? "true" : "false"}
        data-kachel={kachel ? "true" : "false"}
        data-einzelsymbol={einzelSymbol ? "true" : "false"}
      >
        {inhalt}
      </div>
    );
  }

  if (aktion || hatSet) {
    return (
      <button
        class={klassen}
        style={stil}
        disabled={sperrgrund !== undefined || (hatSet && !bedien.darfBedienen)}
        title={titel}
        data-preset={element.preset ?? element.widget}
        data-pending={pending ? "true" : "false"}
        data-kachel={kachel ? "true" : "false"}
        data-einzelsymbol={einzelSymbol ? "true" : "false"}
        onClick={() => {
          if (setKey) {
            bedien.bediene(elementKey, element);
            return;
          }
          if (aktion) onAktion(aktion);
        }}
      >
        {inhalt}
      </button>
    );
  }
  return (
    <div
      class={klassen}
      style={stil}
      title={titel}
      data-preset={element.preset ?? element.widget}
      data-kachel={kachel ? "true" : "false"}
      data-einzelsymbol={einzelSymbol ? "true" : "false"}
    >
      {inhalt}
    </div>
  );
}

function SeitenCanvas({
  seite,
  seiteKey,
  seiteLookup,
  designs,
  werte,
  onAktion,
  bedien,
  popup = false,
}: {
  seite: VisuSeite;
  seiteKey: string;
  seiteLookup: Record<string, VisuSeite>;
  designs: VisuDesigns;
  werte: ReadonlyMap<string, WertEintrag>;
  onAktion: (aktion: VisuAktion) => void;
  bedien: BedienKontext;
  popup?: boolean;
}) {
  const fenster = useViewport();
  const randX = popup ? 64 : 0;
  const randY = popup ? 96 : 54;
  const verfuegbar = { w: Math.max(1, fenster.w - randX), h: Math.max(1, fenster.h - randY) };
  const breakpoint = waehleBreakpoint(seite, verfuegbar.w);
  const canvas = seite.groessen[breakpoint] ?? seite.groessen[seite.basis];
  if (!canvas) return <div class="visu-leer">Keine Canvas-Größe definiert.</div>;
  const faktor = seitenSkalierung(canvas.w, verfuegbar.w);
  const canvasGrundstil = grundstilStil(seite.grundstil);

  return (
    <div class="canvas-rahmen" style={{ width: canvas.w * faktor, height: canvas.h * faktor }}>
      <div
        class="canvas"
        data-breakpoint={breakpoint}
        style={{
          width: canvas.w,
          height: canvas.h,
          transform: `scale(${faktor})`,
          ...canvasGrundstil,
          ...(seite.hintergrund ? { background: seite.hintergrund } : {}),
        }}
      >
        {renderElementeFuerSeite(seiteLookup, seiteKey).map(({ renderKey, elementKey, element, seite: renderSeite }) => {
          const placement = placementFuer(element, breakpoint, renderSeite.basis);
          if (!placement || placement.sichtbar === false) return null;
          const gruppenEbene = element.gruppe ? renderSeite.gruppen?.[element.gruppe]?.ebene ?? 0 : 0;
          return (
            <VisuElementAnsicht
              key={renderKey}
              elementKey={elementKey}
              element={element}
              placement={placement}
              designs={designs}
              werte={werte}
              onAktion={onAktion}
              bedien={bedien}
              zIndex={gruppenEbene + (element.ebene ?? 0)}
              grundstil={grundstilFuerRenderSeite(renderSeite, seite)}
            />
          );
        })}
      </div>
    </div>
  );
}

function reaktionswerte(element: VisuElement): unknown[] {
  return [
    ...(element.design_je_wert ?? []).map((regel) => regel.wenn),
    ...(Array.isArray(element.parameter?.["zustaende"])
      ? element.parameter!["zustaende"].flatMap((zustand) => (
        typeof zustand === "object" && zustand !== null ? [(zustand as Record<string, unknown>)["wenn"]] : []
      )) : []),
  ];
}

function VorschauTafel({
  seite, seiteKey, seiten, datenpunkte, operate, wertSetzen, schliessen,
}: {
  seite: VisuSeite; seiteKey: string; seiten: Record<string, VisuSeite>; datenpunkte: ReadonlyMap<string, DatenpunktSicht>;
  operate: boolean; wertSetzen: (schluessel: string, wert: Wert, echt: boolean) => void; schliessen: () => void;
}) {
  const [echt, setEcht] = useState(false);
  const eintraege = useMemo(() => {
    const werte = new Map<string, unknown[]>();
    for (const { element } of renderElementeFuerSeite(seiten, seiteKey)) {
      for (const schluessel of Object.values(element.bindungen ?? {})) {
        const bisher = werte.get(schluessel) ?? [];
        bisher.push(...reaktionswerte(element));
        werte.set(schluessel, bisher);
      }
    }
    return [...werte.keys()].sort().flatMap((schluessel) => {
      const dp = datenpunkte.get(schluessel);
      if (!dp || (echt && dp.protected)) return [];
      const optionen = [...new Map((werte.get(schluessel) ?? []).map((wert) => [JSON.stringify(wert), wert])).values()]
        .sort((a, b) => String(a).localeCompare(String(b), "de", { numeric: true }));
      return [{ dp, optionen }];
    });
  }, [seite, seiteKey, seiten, datenpunkte, echt]);
  const modus = echt ? "Wirklich setzen" : "Vorschau";
  return <aside class="visu-vorschau" aria-label="Visu-Vorschau">
    <header><strong>{modus}</strong><button onClick={schliessen} aria-label="Vorschau schließen">×</button></header>
    <p>{echt ? "Schreibt echte Werte. Dieser Modus bleibt sichtbar aktiv." : "Werte gelten nur in diesem Browser und werden nicht geschrieben."}</p>
    {operate && <button class={echt ? "vorschau-echt" : ""} onClick={() => {
      if (!echt && !window.confirm("Wirklich setzen schreibt Werte an die Anlage. Fortfahren?")) return;
      setEcht(!echt);
    }}>{echt ? "Zurück zur Vorschau" : "Wirklich setzen aktivieren"}</button>}
    {eintraege.map(({ dp, optionen }) => <section key={dp.schluessel}>
      <strong>{dp.name}</strong><small>{dp.schluessel} · {dp.typ} · {String(dp.wert ?? "—")}</small>
      {dp.typ === "bool" ? <input type="checkbox" checked={Boolean(dp.wert)} onInput={(e) => wertSetzen(dp.schluessel, (e.currentTarget as HTMLInputElement).checked, echt)} />
        : <input type={dp.typ === "zahl" ? "number" : "text"} value={String(dp.wert ?? "")} onChange={(e) => {
          const wert = (e.currentTarget as HTMLInputElement).value;
          wertSetzen(dp.schluessel, dp.typ === "zahl" ? Number(wert) : wert, echt);
        }} />}
      {optionen.length > 0 && <div class="vorschau-werte">{optionen.map((wert) => <button key={JSON.stringify(wert)} onClick={() => wertSetzen(dp.schluessel, wert as Wert, echt)}>{String(wert)}</button>)}</div>}
    </section>)}
  </aside>;
}

function App() {
  const [auth, setAuth] = useState<AuthStatus>({ art: "laedt" });
  const [authZaehler, setAuthZaehler] = useState(0);
  const [visu, setVisu] = useState<VisuAntwort | null>(null);
  const [werte, setWerte] = useState<Map<string, WertEintrag>>(new Map());
  const [datenpunkte, setDatenpunkte] = useState<Map<string, DatenpunktSicht>>(new Map());
  const [gesperrt, setGesperrt] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [slider, setSlider] = useState<Map<string, number>>(new Map());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seiteKey, setSeiteKey] = useState<string | null>(null);
  const [popupKey, setPopupKey] = useState<string | null>(null);
  const [live, setLive] = useState<LiveStatus>("verbindet");
  const [liveNachricht, setLiveNachricht] = useState<LiveWert | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschauOffen, setVorschauOffen] = useState(false);
  const [vorschauWerte, setVorschauWerte] = useState<Map<string, Wert>>(new Map());
  const pendingRef = useRef(new Map<string, { wert: Wert; timer: ReturnType<typeof setTimeout> }>());
  const toastIdRef = useRef(0);

  useEffect(() => {
    setzeAuthErforderlichHandler(() => setAuth({ art: "login" }));
    return () => setzeAuthErforderlichHandler(null);
  }, []);

  const ladeIdentitaet = async (): Promise<void> => {
    try {
      const ich = await api.ich();
      setAuth({ art: "bereit", ich });
      setAuthZaehler((alt) => alt + 1);
    } catch (error) {
      if (error instanceof Error) setFehler(error.message);
    }
  };

  useEffect(() => {
    void ladeIdentitaet();
  }, []);

  useEffect(() => {
    if (auth.art !== "bereit") return;
    let aktiv = true;
    void ladeVisuDaten()
      .then(({ visu: geladen, datenpunkte }) => {
        if (!aktiv) return;
        setVisu(geladen);
        setDatenpunkte(new Map(datenpunkte.map((dp) => [dp.schluessel, dp])));
        setWerte(new Map(datenpunkte.map((dp) => [
          dp.schluessel,
          { wert: dp.wert, ...(dp.format ? { format: dp.format } : {}) },
        ])));
        const ausUrl = new URLSearchParams(location.search).get("seite");
        setSeiteKey(startSeite(geladen.seiten, ausUrl));
      })
      .catch((error: unknown) => {
        if (aktiv) setFehler(error instanceof Error ? error.message : String(error));
      });
    return () => { aktiv = false; };
  }, [auth.art, authZaehler]);

  useEffect(() => {
    if (!visu) return;
    const schriften = new Set(schriftartenAusDesigns(visu.designs));
    for (const seite of Object.values(visu.seiten)) {
      if (seite.grundstil?.schriftart) schriften.add(seite.grundstil.schriftart);
    }
    const css = fontFaceCssFuerSchriften([...schriften]);
    if (!css) return;
    const style = document.createElement("style");
    style.dataset["fachwerkVisuSchriften"] = "true";
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  }, [visu]);

  useEffect(() => () => {
    for (const eintrag of pendingRef.current.values()) clearTimeout(eintrag.timer);
    pendingRef.current.clear();
  }, []);

  const zeigeToast = (text: string, ton: ToastTon = "info"): void => {
    const id = ++toastIdRef.current;
    setToasts((alt) => [...alt.slice(-3), { id, text, ton }]);
    setTimeout(() => setToasts((alt) => alt.filter((toast) => toast.id !== id)), 4_000);
  };

  const markierePending = (schluessel: string, wert: Wert, meldungsName: string): void => {
    const alt = pendingRef.current.get(schluessel);
    if (alt) clearTimeout(alt.timer);
    const timer = setTimeout(() => {
      pendingRef.current.delete(schluessel);
      setPending((bisher) => {
        const neu = new Set(bisher);
        neu.delete(schluessel);
        return neu;
      });
      zeigeToast(`Keine Rückmeldung für ${meldungsName}`, "warn");
    }, 3_000);
    pendingRef.current.set(schluessel, { wert, timer });
    setPending((bisher) => new Set(bisher).add(schluessel));
  };

  const entfernePending = (schluessel: string): void => {
    const alt = pendingRef.current.get(schluessel);
    if (alt) clearTimeout(alt.timer);
    pendingRef.current.delete(schluessel);
    setPending((bisher) => {
      const neu = new Set(bisher);
      neu.delete(schluessel);
      return neu;
    });
  };

  const setzeSlider = (schluessel: string, wert: number | null): void => {
    setSlider((alt) => {
      const neu = new Map(alt);
      if (wert === null) neu.delete(schluessel);
      else neu.set(schluessel, wert);
      return neu;
    });
  };

  const bediene = (elementKey: string, element: VisuElement, direkterWert?: Wert): void => {
    const setKey = element.bindungen?.["set"];
    if (!setKey) return;
    const designStatusKey = element.bindungen?.["status"];
    const designStatus = designStatusKey ? werte.get(designStatusKey)?.wert : undefined;
    const design = visu ? designFuer(element, visu.designs, designStatus) : undefined;
    const meldungsName = elementAnzeige("client", elementKey, element, werte, undefined, design).label || "Element";
    if (!bedien.darfBedienen) {
      zeigeToast(`${meldungsName}: Scope operate fehlt`, "warn");
      return;
    }
    const sperrgrund = gesperrt.get(setKey);
    if (sperrgrund) {
      zeigeToast(sperrgrund, "warn");
      return;
    }
    const dp = datenpunkte.get(setKey);
    // Die Aktionsfassung gewinnt: sie beachtet zusaetzlich aktion.status und
    // faellt sonst auf genau dieselbe Kette zurueck.
    const statusKey = statusSchluesselFuerAktion(element, setKey);
    const statusWert = werte.get(statusKey)?.wert;
    const aktion = direkterWert === undefined
      ? wertAusAktion(element, dp, statusWert)
      : (dp ? { art: "setzen" as const, wert: direkterWert } : { art: "nicht_moeglich" as const, grund: "Datenpunkt nicht geladen" });
    if (aktion.art === "nicht_moeglich") {
      if (dp?.protected) setGesperrt((alt) => new Map(alt).set(setKey, aktion.grund));
      zeigeToast(`${meldungsName}: ${aktion.grund}`, "warn");
      return;
    }
    if (!dp || !wertPasstZumDatenpunkt(aktion.wert, dp)) {
      zeigeToast(`${meldungsName}: Wert passt nicht zu ${dp?.typ ?? "Datenpunkt"}`, "warn");
      return;
    }
    markierePending(setKey, aktion.wert, meldungsName);
    void api.setzeDatenpunkt(setKey, aktion.wert)
      .then((antwort) => {
        if (antwort.hinweis) zeigeToast(antwort.hinweis, "info");
      })
      .catch((error: unknown) => {
        entfernePending(setKey);
        const grund = error instanceof ApiFehler ? error.message : error instanceof Error ? error.message : String(error);
        if (error instanceof ApiFehler && (error.status === 401 || error.status === 403)) {
          setGesperrt((alt) => new Map(alt).set(setKey, grund));
        }
        zeigeToast(`${meldungsName}: ${grund}`, "fehler");
      });
  };

  useEffect(() => {
    if (auth.art !== "bereit") return;
    return verbindeLive((nachricht: LiveNachricht) => {
    if (nachricht.art !== "wert") return;
    setLiveNachricht(nachricht);
    const offen = pendingRef.current.get(nachricht.schluessel);
    if (offen && Object.is(offen.wert, nachricht.wert)) entfernePending(nachricht.schluessel);
    setWerte((alt) => {
      const neu = new Map(alt);
      neu.set(nachricht.schluessel, { ...alt.get(nachricht.schluessel), wert: nachricht.wert });
      return neu;
    });
    setDatenpunkte((alt) => {
      const dp = alt.get(nachricht.schluessel);
      if (!dp) return alt;
      const neu = new Map(alt);
      neu.set(nachricht.schluessel, { ...dp, wert: nachricht.wert, ts: nachricht.ts });
      return neu;
    });
    }, (verbunden) => setLive(verbunden ? "verbunden" : "getrennt"));
  }, [auth.art, authZaehler]);

  useEffect(() => {
    const schliessen = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setPopupKey(null);
    };
    window.addEventListener("keydown", schliessen);
    return () => window.removeEventListener("keydown", schliessen);
  }, []);

  const aktiviere = (aktion: VisuAktion): void => {
    if (!visu) return;
    const ziel = "seite" in aktion ? aktion.seite : "popup" in aktion ? aktion.popup : null;
    if (!ziel) return;
    const zielSeite = visu.seiten[ziel];
    if (!zielSeite) return;
    if (zielSeite.typ === "include") return;
    if ("popup" in aktion || zielSeite.typ === "popup") {
      setPopupKey(ziel);
      return;
    }
    if (zielSeite.typ !== "seite") return;
    setPopupKey(null);
    setSeiteKey(ziel);
    const url = new URL(location.href);
    url.searchParams.set("seite", ziel);
    history.replaceState(null, "", url);
  };

  const bedien = useMemo<BedienKontext>(() => ({
    datenpunkte,
    gesperrt,
    pending,
    slider,
    liveNachricht,
    darfBedienen: auth.art === "bereit" && hatScope(auth.ich, "operate"),
    setzeSlider,
    bediene,
  }), [datenpunkte, gesperrt, pending, slider, liveNachricht, werte, auth]);
  const darstellungsWerte = useMemo(() => {
    const kombiniert = new Map(werte);
    for (const [schluessel, wert] of vorschauWerte) kombiniert.set(schluessel, { ...kombiniert.get(schluessel), wert });
    return kombiniert;
  }, [werte, vorschauWerte]);

  if (auth.art === "login") return <LoginAnsicht titel="Fachwerk Visu" onErfolg={() => void ladeIdentitaet()} />;
  if (auth.art === "laedt") return <main class="visu-meldung"><h1>Fachwerk Visu</h1><p>Rechte werden geprüft …</p></main>;

  const ich: IchAntwort = auth.ich;

  if (fehler) return <main class="visu-meldung fehler"><h1>Fachwerk Visu</h1><p>{fehler}</p></main>;
  if (!visu) return <main class="visu-meldung"><h1>Fachwerk Visu</h1><p>Visualisierung wird geladen …</p></main>;
  if (!seiteKey || !visu.seiten[seiteKey]) {
    return <main class="visu-meldung"><h1>Fachwerk Visu</h1><p>Keine sichtbare Seite vorhanden.</p></main>;
  }
  const seite = visu.seiten[seiteKey];
  const popup = popupKey ? visu.seiten[popupKey] : undefined;

  return (
    <main class="visu-app">
      <header class="visu-kopf">
        <strong>Fachwerk Visu</strong>
        <span>{seite.name}</span>
        <button class="visu-vorschau-oeffnen" onClick={() => setVorschauOffen(true)}>Vorschau</button>
        <span class={live === "verbunden" ? "live-ok" : "live-wartet"} title={`${ich.name} · ${ich.art}`}>
          {live === "verbunden" ? "● live" : "○ verbindet"}
        </span>
      </header>
      <section class="visu-flaeche" aria-label={seite.name}>
        <SeitenCanvas seite={seite} seiteKey={seiteKey} seiteLookup={visu.seiten} designs={visu.designs} werte={darstellungsWerte} onAktion={aktiviere} bedien={bedien} />
      </section>
      {popup && popupKey && (
        <div class="popup-hintergrund" role="presentation" onClick={() => setPopupKey(null)}>
          <section
            class="popup"
            role="dialog"
            aria-modal="true"
            aria-label={popup.name}
            onClick={(event) => event.stopPropagation()}
          >
            <button class="popup-schliessen" aria-label="Popup schließen" onClick={() => setPopupKey(null)}>×</button>
            <SeitenCanvas seite={popup} seiteKey={popupKey} seiteLookup={visu.seiten} designs={visu.designs} werte={darstellungsWerte} onAktion={aktiviere} bedien={bedien} popup />
          </section>
        </div>
      )}
      {vorschauOffen && <VorschauTafel seite={seite} seiteKey={seiteKey} seiten={visu.seiten} datenpunkte={datenpunkte} operate={hatScope(ich, "operate")} schliessen={() => setVorschauOffen(false)} wertSetzen={(schluessel, wert, echt) => {
        if (echt) {
          void api.setzeDatenpunkt(schluessel, wert).catch((error: unknown) => zeigeToast(error instanceof Error ? error.message : String(error), "fehler"));
          return;
        }
        // Der Standardpfad ist strikt lokal: kein API-Aufruf, kein Buszugriff.
        setVorschauWerte((alt) => new Map(alt).set(schluessel, wert));
      }} />}
      {live === "getrennt" && (
        <div class="verbindung-verloren" role="status">Verbindung verloren – neuer Versuch läuft …</div>
      )}
      <div class="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => <div key={toast.id} class={`toast toast-${toast.ton}`}>{toast.text}</div>)}
      </div>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
