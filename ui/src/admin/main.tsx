import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "../lib/stil.css";
import "./admin.css";
import {
  api,
  verbindeLive,
  type DatenpunktSicht,
  type GewerkStruktur,
  type LiveNachricht,
  type Status,
  type Trace,
} from "../lib/api.ts";
import { BildPuffer } from "./batching.ts";
import { dauer } from "./format.ts";
import { Datenpunkte } from "./datenpunkte.tsx";
import { Traces } from "./traces.tsx";
import { Logik, type LetzterSchritt } from "./logik.tsx";

const TRACE_LIMIT = 300;
type Ansicht = "datenpunkte" | "traces" | "logik";
type WertNachricht = Extract<LiveNachricht, { art: "wert" }>;

const thema = new URLSearchParams(location.search).get("theme");
if (thema === "light" || thema === "dark") document.documentElement.dataset.theme = thema;

function schritteAus(traces: Trace[], alt: Record<string, LetzterSchritt>): Record<string, LetzterSchritt> {
  const neu = { ...alt };
  for (const trace of traces) {
    for (const schritt of trace.schritte) {
      const bisher = neu[schritt.knoten];
      if (bisher && bisher.traceNr > trace.nr) continue;
      neu[schritt.knoten] = {
        ts: trace.gestartet,
        traceNr: trace.nr,
        eingaenge: schritt.eingaenge,
        ausgaenge: schritt.ausgaenge,
        fehler: schritt.fehler,
      };
    }
  }
  return neu;
}

function StatusChip({ label, aktiv, title }: { label: string; aktiv: boolean; title: string }) {
  return <span class={`status-chip ${aktiv ? "status-ok" : "status-aus"}`} title={title}><i />{label}</span>;
}

function Kopf({ status, live }: { status: Status | null; live: boolean }) {
  const knx = status?.knx;
  const mqtt = status?.mqtt;
  return (
    <>
      <header class="kopf">
        <div class="gewerk-titel"><span class="produkt">FACHWERK</span><strong>{status?.gewerk ?? "Gewerk wird geladen …"}</strong></div>
        <div class="kopf-status">
          <StatusChip label="KNX" aktiv={knx?.verbunden ?? false} title={knx ? `${knx.verbunden ? "Verbunden" : "Getrennt"}${knx.adresse ? ` · ${knx.adresse} · Kanal ${knx.kanal}` : ""}` : "KNX nicht konfiguriert"} />
          <StatusChip label="MQTT" aktiv={mqtt?.verbunden ?? false} title={mqtt ? `${mqtt.verbunden ? "Verbunden" : "Getrennt"}${mqtt.topics !== undefined ? ` · ${mqtt.topics} Topics` : ""}` : "MQTT nicht konfiguriert"} />
          <StatusChip label={live ? "LIVE" : "OFFLINE"} aktiv={live} title={live ? "WebSocket verbunden" : "WebSocket wird erneut verbunden"} />
          {status && <span class="kopf-uptime" title="Laufzeit">{dauer(status.uptimeMs)}</span>}
        </div>
      </header>
      {knx?.modus === "beobachten" && <div class="beobachtung" role="status"><span>BEOBACHTUNG</span> KNX-Telegramme werden gelesen, aber nie gesendet.</div>}
    </>
  );
}

const navigation: Array<{ id: Ansicht; icon: string; label: string; taste: string }> = [
  { id: "datenpunkte", icon: "▦", label: "Datenpunkte", taste: "1" },
  { id: "traces", icon: "⌁", label: "Traces", taste: "2" },
  { id: "logik", icon: "◇", label: "Logik", taste: "3" },
];

function Navigation({ ansicht, wechseln, wartend }: { ansicht: Ansicht; wechseln: (ansicht: Ansicht) => void; wartend: number }) {
  return (
    <nav class="seitenleiste" aria-label="Hauptnavigation">
      <div class="seitenleiste-marke" title="Fachwerk">F</div>
      <div class="nav-gruppe">
        {navigation.map((eintrag) => (
          <button key={eintrag.id} aria-pressed={ansicht === eintrag.id} title={`${eintrag.label} (${eintrag.taste})`} onClick={() => wechseln(eintrag.id)}>
            <span class="nav-icon" aria-hidden="true">{eintrag.icon}</span><span class="nav-label">{eintrag.label}</span>
            {eintrag.id === "traces" && wartend > 0 && <span class="nav-punkt" aria-label={`${wartend} neue Traces`} />}
          </button>
        ))}
      </div>
      <div class="nav-gruppe nav-unten">
        <button disabled title="Archiv – folgt in einer späteren Ausbaustufe"><span class="nav-icon" aria-hidden="true">▣</span><span class="nav-label">Archiv</span></button>
        <button disabled title="Einstellungen – folgt in einer späteren Ausbaustufe"><span class="nav-icon" aria-hidden="true">⚙</span><span class="nav-label">Einstellungen</span></button>
      </div>
    </nav>
  );
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dps, setDps] = useState<DatenpunktSicht[]>([]);
  const [geaendert, setGeaendert] = useState<Record<string, number>>({});
  const [live, setLive] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>("datenpunkte");
  const [gewerk, setGewerk] = useState<GewerkStruktur | null>(null);
  const [schritte, setSchritte] = useState<Record<string, LetzterSchritt>>({});
  const [traces, setTraces] = useState<Trace[]>([]);
  const [pausiert, setPausiert] = useState(false);
  const [wartend, setWartend] = useState(0);
  const [escSignal, setEscSignal] = useState(0);
  const sucheRef = useRef<HTMLInputElement>(null);
  const tracePuffer = useRef<Trace[]>([]);
  const pausiertRef = useRef(false);

  useEffect(() => {
    let aktiv = true;
    const laden = async (): Promise<void> => {
      try {
        const [s, d, t, g] = await Promise.all([api.status(), api.datenpunkte(), api.traces(100), api.gewerk()]);
        if (!aktiv) return;
        setStatus(s);
        setDps(d.datenpunkte);
        setTraces([...t.traces].sort((a, b) => b.nr - a.nr));
        setSchritte((alt) => schritteAus(t.traces, alt));
        setGewerk(g);
        setFehler(null);
      } catch (error) {
        if (aktiv) setFehler(error instanceof Error ? error.message : String(error));
      }
    };
    void laden();
    const timer = setInterval(() => void api.status().then(setStatus).catch(() => {}), 5_000);
    return () => { aktiv = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const wertPuffer = new BildPuffer<WertNachricht>();
    let bild: number | null = null;
    const anwenden = (): void => {
      bild = null;
      const updates = wertPuffer.entleere();
      if (updates.size === 0) return;
      const zeitpunkt = Date.now();
      setDps((alt) => alt.map((dp) => {
        const update = updates.get(dp.schluessel);
        return update ? { ...dp, wert: update.wert, ts: update.ts } : dp;
      }));
      setGeaendert((alt) => {
        const neu = { ...alt };
        for (const key of updates.keys()) neu[key] = zeitpunkt;
        return neu;
      });
    };
    const trennen = verbindeLive((nachricht) => {
      if (nachricht.art === "wert") {
        wertPuffer.schreibe(nachricht.schluessel, nachricht);
        if (bild === null) bild = requestAnimationFrame(anwenden);
        return;
      }
      setSchritte((alt) => schritteAus([nachricht.trace], alt));
      if (pausiertRef.current) {
        tracePuffer.current.push(nachricht.trace);
        setWartend(tracePuffer.current.length);
      } else {
        setTraces((alt) => [nachricht.trace, ...alt].slice(0, TRACE_LIMIT));
      }
    }, setLive);
    return () => { trennen(); if (bild !== null) cancelAnimationFrame(bild); };
  }, []);

  useEffect(() => {
    const tastatur = (event: KeyboardEvent): void => {
      const ziel = event.target as HTMLElement | null;
      const schreibt = ziel?.matches("input, textarea, select, [contenteditable='true']") ?? false;
      if (event.key === "Escape") { setEscSignal((alt) => alt + 1); (ziel as HTMLElement | null)?.blur?.(); return; }
      if (schreibt) return;
      if (event.key === "/") {
        event.preventDefault();
        setAnsicht("datenpunkte");
        requestAnimationFrame(() => sucheRef.current?.focus());
      }
      if (event.key === "1") setAnsicht("datenpunkte");
      if (event.key === "2") setAnsicht("traces");
      if (event.key === "3") setAnsicht("logik");
    };
    window.addEventListener("keydown", tastatur);
    return () => window.removeEventListener("keydown", tastatur);
  }, []);

  const setzePause = (an: boolean): void => {
    pausiertRef.current = an;
    setPausiert(an);
    if (!an && tracePuffer.current.length > 0) {
      const neu = tracePuffer.current.splice(0).reverse();
      setTraces((alt) => [...neu, ...alt].slice(0, TRACE_LIMIT));
    }
    if (!an) setWartend(0);
  };

  return (
    <div class="admin-shell">
      <Navigation ansicht={ansicht} wechseln={setAnsicht} wartend={pausiert ? wartend : 0} />
      <div class="admin-inhalt">
        <div class="admin-kopfbereich"><Kopf status={status} live={live} /></div>
        {fehler && <div class="fehlermeldung" role="alert"><strong>API nicht erreichbar</strong><span>{fehler}</span></div>}
        <main>
          <section hidden={ansicht !== "datenpunkte"} aria-label="Datenpunkte"><Datenpunkte dps={dps} geaendert={geaendert} sucheRef={sucheRef} /></section>
          <section hidden={ansicht !== "traces"} aria-label="Traces"><Traces traces={traces} pausiert={pausiert} wartend={wartend} setzePause={setzePause} escSignal={escSignal} /></section>
          <section hidden={ansicht !== "logik"} aria-label="Logik"><Logik gewerk={gewerk} dps={dps} schritte={schritte} escSignal={escSignal} /></section>
        </main>
      </div>
    </div>
  );
}

render(<App />, document.getElementById("app")!);
