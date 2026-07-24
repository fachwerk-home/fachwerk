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
import { wertAusAktion, wertPasstZumDatenpunkt } from "./bedienen.ts";
import { ladeVisuDaten, type VisuAntwort } from "./client.ts";
import {
  designFuer,
  elementAnzeige,
  fontFaceCssFuerDesigns,
  placementFuer,
  renderElementeFuerSeite,
  schriftfamilieFuer,
  startSeite,
  waehleBreakpoint,
  type WertEintrag,
} from "./modell.ts";

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
    ...(design.schriftart ? { fontFamily: schriftfamilieFuer(design.schriftart) } : {}),
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

function diagrammArchiv(element: VisuElement): string | undefined {
  const archiv = element.parameter?.["archiv"];
  return typeof archiv === "string" && archiv.length > 0 ? archiv : element.bindungen?.["display"];
}

function diagrammStunden(element: VisuElement): number {
  const stunden = element.parameter?.["stunden"];
  return typeof stunden === "number" && Number.isFinite(stunden) && stunden > 0 ? stunden : 24;
}

function ElementInhalt({
  elementKey,
  element,
  placement,
  werte,
  design,
  bedien,
}: {
  elementKey: string;
  element: VisuElement;
  placement: VisuPlacement;
  werte: ReadonlyMap<string, WertEintrag>;
  design: VisuDesign;
  bedien: BedienKontext;
}): ComponentChildren {
  const anzeige = elementAnzeige("client", elementKey, element, werte, placement);

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
      return <span class="symbol" aria-label={anzeige.label}>{design.icon ?? (anzeige.hatText ? anzeige.label : anzeige.rohwert ? "●" : "○")}</span>;
    case "label":
      return <span>{anzeige.hatText ? anzeige.label : anzeige.wert || anzeige.label}</span>;
    case "wertanzeige":
      // Etikett nur, wenn es gepflegt ist. Eine reine Messwert-Kachel traegt
      // im Original oft gar keine Beschriftung (die steht als eigenes Label
      // daneben) — der Schluessel-Fallback waere dort erfundene Zierde.
      return <>{anzeige.hatText && <span class="element-name">{anzeige.label}</span>}<strong class="element-wert">{anzeige.wert || "—"}</strong></>;
    case "statusanzeige":
      return <><span class="status-punkt" aria-hidden="true" /> <span class="element-name">{anzeige.label}</span>{anzeige.hatWert && <strong class="element-wert">{anzeige.wert || "—"}</strong>}</>;
    case "schalter":
      return <><span>{anzeige.label}</span><strong>{anzeige.wert || (anzeige.rohwert ? "An" : "Aus")}</strong></>;
    case "taster":
      return <span>{anzeige.label}</span>;
    case "navigation":
      return <span>{anzeige.label} <span aria-hidden="true">→</span></span>;
    default:
      return <span>{anzeige.hatText ? anzeige.label : anzeige.wert || anzeige.label}</span>;
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
}: {
  elementKey: string;
  element: VisuElement;
  placement: VisuPlacement;
  designs: VisuDesigns;
  werte: ReadonlyMap<string, WertEintrag>;
  onAktion: (aktion: VisuAktion) => void;
  bedien: BedienKontext;
  zIndex: number;
}) {
  const statusKey = element.bindungen?.["status"];
  const status = statusKey ? werte.get(statusKey)?.wert : undefined;
  const design = designFuer(element, designs, status);
  const aktion = navigationsAktion(element);
  const setKey = element.bindungen?.["set"];
  const sperrgrund = setKey ? bedien.gesperrt.get(setKey) : undefined;
  const pending = setKey ? bedien.pending.has(setKey) : false;
  const hatSet = setKey !== undefined;
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
      bedien={bedien}
    />
  );
  const klassen = [
    "visu-element",
    sperrgrund ? "visu-element-deaktiviert" : "",
    pending ? "visu-element-gedrueckt" : "",
  ].filter(Boolean).join(" ");
  const titel = hatSet && !bedien.darfBedienen ? "Scope operate fehlt" : sperrgrund;

  if (element.widget === "diagramm" || element.widget === "slider") {
    return (
      <div
        class={klassen}
        style={stil}
        title={titel}
        data-preset={element.preset ?? element.widget}
        data-pending={pending ? "true" : "false"}
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
    <div class={klassen} style={stil} title={titel} data-preset={element.preset ?? element.widget}>
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
  const faktor = Math.min(verfuegbar.w / canvas.w, verfuegbar.h / canvas.h);

  return (
    <div class="canvas-rahmen" style={{ width: canvas.w * faktor, height: canvas.h * faktor }}>
      <div
        class="canvas"
        data-breakpoint={breakpoint}
        style={{
          width: canvas.w,
          height: canvas.h,
          transform: `scale(${faktor})`,
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
            />
          );
        })}
      </div>
    </div>
  );
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
    const css = fontFaceCssFuerDesigns(visu.designs);
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
    const meldungsName = elementAnzeige("client", elementKey, element, werte).label || "Element";
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
    const statusKey = element.bindungen?.["status"] ?? element.bindungen?.["display"] ?? setKey;
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
        <span class={live === "verbunden" ? "live-ok" : "live-wartet"} title={`${ich.name} · ${ich.art}`}>
          {live === "verbunden" ? "● live" : "○ verbindet"}
        </span>
      </header>
      <section class="visu-flaeche" aria-label={seite.name}>
        <SeitenCanvas seite={seite} seiteKey={seiteKey} seiteLookup={visu.seiten} designs={visu.designs} werte={werte} onAktion={aktiviere} bedien={bedien} />
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
            <SeitenCanvas seite={popup} seiteKey={popupKey} seiteLookup={visu.seiten} designs={visu.designs} werte={werte} onAktion={aktiviere} bedien={bedien} popup />
          </section>
        </div>
      )}
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
