import { render, type ComponentChildren, type JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
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
import { verbindeLive, type LiveNachricht } from "../lib/api.ts";
import { ladeVisuDaten, type VisuAntwort } from "./client.ts";
import {
  designFuer,
  formatierterWert,
  lesbarerName,
  placementFuer,
  startSeite,
  waehleBreakpoint,
  type WertEintrag,
} from "./modell.ts";

type LiveStatus = "verbindet" | "verbunden" | "getrennt";

function viewport(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

function useViewport(): { w: number; h: number } {
  const [groesse, setGroesse] = useState(viewport);
  useEffect(() => {
    const aktualisiere = (): void => setGroesse(viewport());
    window.addEventListener("resize", aktualisiere);
    return () => window.removeEventListener("resize", aktualisiere);
  }, []);
  return groesse;
}

function designStil(design: VisuDesign): JSX.CSSProperties {
  const rand = design.rand;
  return {
    ...(design.hintergrund ? { background: design.hintergrund } : {}),
    ...(design.text ? { color: design.text } : {}),
    ...(design.schriftgroesse ? { fontSize: `${design.schriftgroesse}px` } : {}),
    ...(design.deckkraft !== undefined ? { opacity: design.deckkraft } : {}),
    ...(rand?.staerke !== undefined ? { borderWidth: `${rand.staerke}px` } : {}),
    ...(rand?.farbe ? { borderColor: rand.farbe } : {}),
    ...(rand?.radius !== undefined ? { borderRadius: `${rand.radius}px` } : {}),
  };
}

function navigationsAktion(element: VisuElement): VisuAktion | undefined {
  return Object.values(element.aktionen ?? {}).find(
    (aktion) => "seite" in aktion || "popup" in aktion,
  );
}

function ElementInhalt({
  elementKey,
  element,
  placement,
  werte,
  design,
}: {
  elementKey: string;
  element: VisuElement;
  placement: VisuPlacement;
  werte: ReadonlyMap<string, WertEintrag>;
  design: VisuDesign;
}): ComponentChildren {
  const displayKey = element.bindungen?.["display"];
  const statusKey = element.bindungen?.["status"];
  const wertKey = displayKey ?? statusKey;
  const text = formatierterWert(wertKey, werte, element.format, placement.format);
  const rohwert = wertKey ? werte.get(wertKey)?.wert : undefined;
  const anzeigeText = typeof rohwert === "boolean" && (text === "true" || text === "false")
    ? (rohwert ? "An" : "Aus")
    : text;
  const name = lesbarerName(elementKey);

  if (element.widget === "slider") {
    const min = typeof element.parameter?.["min"] === "number" ? element.parameter["min"] : 0;
    const max = typeof element.parameter?.["max"] === "number" ? element.parameter["max"] : 100;
    const zahl = typeof rohwert === "number" ? rohwert : min;
    return (
      <div class="slider-inhalt">
        <span>{name}</span>
        <input aria-label={name} type="range" min={min} max={max} value={zahl} disabled />
        <strong>{anzeigeText}</strong>
      </div>
    );
  }

  switch (element.preset) {
    case "symbol":
      return <span class="symbol" aria-label={name}>{design.icon ?? (rohwert ? "●" : "○")}</span>;
    case "label":
      return <span>{anzeigeText || name}</span>;
    case "wertanzeige":
      return <><span class="element-name">{name}</span><strong class="element-wert">{anzeigeText || "—"}</strong></>;
    case "statusanzeige":
      return <><span class="status-punkt" aria-hidden="true" /> <span>{anzeigeText || name}</span></>;
    case "schalter":
      return <><span>{name}</span><strong>{anzeigeText || (rohwert ? "An" : "Aus")}</strong></>;
    case "taster":
      return <span>{name}</span>;
    case "navigation":
      return <span>{name} <span aria-hidden="true">→</span></span>;
    default:
      return <span>{anzeigeText || name}</span>;
  }
}

function VisuElementAnsicht({
  elementKey,
  element,
  placement,
  designs,
  werte,
  onAktion,
  zIndex,
}: {
  elementKey: string;
  element: VisuElement;
  placement: VisuPlacement;
  designs: VisuDesigns;
  werte: ReadonlyMap<string, WertEintrag>;
  onAktion: (aktion: VisuAktion) => void;
  zIndex: number;
}) {
  const statusKey = element.bindungen?.["status"];
  const status = statusKey ? werte.get(statusKey)?.wert : undefined;
  const design = designFuer(element, designs, status);
  const aktion = navigationsAktion(element);
  const hatSet = element.bindungen?.["set"] !== undefined;
  const stil: JSX.CSSProperties = {
    left: placement.x ?? 0,
    top: placement.y ?? 0,
    width: placement.w ?? 0,
    height: placement.h ?? 0,
    zIndex,
    ...designStil(design),
  };
  const inhalt = (
    <ElementInhalt
      elementKey={elementKey}
      element={element}
      placement={placement}
      werte={werte}
      design={design}
    />
  );
  const klassen = `visu-element ${hatSet ? "visu-element-deaktiviert" : ""}`;
  const titel = hatSet ? "Bedienen kommt mit P5-8" : undefined;

  if (aktion || hatSet) {
    return (
      <button
        class={klassen}
        style={stil}
        disabled={hatSet}
        title={titel}
        data-preset={element.preset ?? element.widget}
        onClick={() => { if (aktion) onAktion(aktion); }}
      >
        {inhalt}
      </button>
    );
  }
  return (
    <div class={klassen} style={stil} title={titel} data-preset={element.preset ?? element.widget}>
      {inhalt}
    </div>
  );
}

function SeitenCanvas({
  seite,
  designs,
  werte,
  onAktion,
  popup = false,
}: {
  seite: VisuSeite;
  designs: VisuDesigns;
  werte: ReadonlyMap<string, WertEintrag>;
  onAktion: (aktion: VisuAktion) => void;
  popup?: boolean;
}) {
  const fenster = useViewport();
  const randX = popup ? 64 : 0;
  const randY = popup ? 96 : 54;
  const verfuegbar = { w: Math.max(1, fenster.w - randX), h: Math.max(1, fenster.h - randY) };
  const breakpoint = waehleBreakpoint(seite, verfuegbar.w);
  const canvas = seite.groessen[breakpoint] ?? seite.groessen[seite.basis];
  if (!canvas) return <div class="visu-leer">Keine Canvas-Größe definiert.</div>;
  const faktor = Math.min(verfuegbar.w / canvas.w, verfuegbar.h / canvas.h);

  return (
    <div class="canvas-rahmen" style={{ width: canvas.w * faktor, height: canvas.h * faktor }}>
      <div
        class="canvas"
        data-breakpoint={breakpoint}
        style={{ width: canvas.w, height: canvas.h, transform: `scale(${faktor})` }}
      >
        {Object.entries(seite.elemente).map(([key, element]) => {
          const placement = placementFuer(element, breakpoint, seite.basis);
          if (!placement || placement.sichtbar === false) return null;
          const gruppenEbene = element.gruppe ? seite.gruppen?.[element.gruppe]?.ebene ?? 0 : 0;
          return (
            <VisuElementAnsicht
              key={key}
              elementKey={key}
              element={element}
              placement={placement}
              designs={designs}
              werte={werte}
              onAktion={onAktion}
              zIndex={gruppenEbene + (element.ebene ?? 0)}
            />
          );
        })}
      </div>
    </div>
  );
}

function App() {
  const [visu, setVisu] = useState<VisuAntwort | null>(null);
  const [werte, setWerte] = useState<Map<string, WertEintrag>>(new Map());
  const [seiteKey, setSeiteKey] = useState<string | null>(null);
  const [popupKey, setPopupKey] = useState<string | null>(null);
  const [live, setLive] = useState<LiveStatus>("verbindet");
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    void ladeVisuDaten()
      .then(({ visu: geladen, datenpunkte }) => {
        if (!aktiv) return;
        setVisu(geladen);
        setWerte(new Map(datenpunkte.map((dp) => [
          dp.schluessel,
          { wert: dp.wert, ...(dp.format ? { format: dp.format } : {}) },
        ])));
        const ausUrl = new URLSearchParams(location.search).get("seite");
        setSeiteKey(startSeite(geladen.seiten, ausUrl));
        for (const [key, seite] of Object.entries(geladen.seiten)) {
          if (seite.typ === "include") console.info(`Include-Seite ${key} wird in v1 nicht gerendert.`);
        }
      })
      .catch((error: unknown) => {
        if (aktiv) setFehler(error instanceof Error ? error.message : String(error));
      });
    return () => { aktiv = false; };
  }, []);

  useEffect(() => verbindeLive((nachricht: LiveNachricht) => {
    if (nachricht.art !== "wert") return;
    setWerte((alt) => {
      const neu = new Map(alt);
      neu.set(nachricht.schluessel, { ...alt.get(nachricht.schluessel), wert: nachricht.wert });
      return neu;
    });
  }, (verbunden) => setLive(verbunden ? "verbunden" : "getrennt")), []);

  const aktiviere = (aktion: VisuAktion): void => {
    if (!visu) return;
    const ziel = "seite" in aktion ? aktion.seite : "popup" in aktion ? aktion.popup : null;
    if (!ziel) return;
    const zielSeite = visu.seiten[ziel];
    if (!zielSeite) return;
    if (zielSeite.typ === "include") {
      console.info(`Include-Seite ${ziel} wird in v1 nicht gerendert.`);
      return;
    }
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
        <span class={live === "verbunden" ? "live-ok" : "live-wartet"}>
          {live === "verbunden" ? "● live" : "○ verbindet"}
        </span>
      </header>
      <section class="visu-flaeche" aria-label={seite.name}>
        <SeitenCanvas seite={seite} designs={visu.designs} werte={werte} onAktion={aktiviere} />
      </section>
      {popup && (
        <div class="popup-hintergrund" role="presentation" onClick={() => setPopupKey(null)}>
          <section
            class="popup"
            role="dialog"
            aria-modal="true"
            aria-label={popup.name}
            onClick={(event) => event.stopPropagation()}
          >
            <button class="popup-schliessen" aria-label="Popup schließen" onClick={() => setPopupKey(null)}>×</button>
            <SeitenCanvas seite={popup} designs={visu.designs} werte={werte} onAktion={aktiviere} popup />
          </section>
        </div>
      )}
      {live === "getrennt" && (
        <div class="verbindung-verloren" role="status">Verbindung verloren – neuer Versuch läuft …</div>
      )}
    </main>
  );
}

render(<App />, document.getElementById("app")!);
