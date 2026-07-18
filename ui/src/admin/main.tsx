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
import { dauer } from "./format.ts";
import { Datenpunkte } from "./datenpunkte.tsx";
import { Traces } from "./traces.tsx";
import { Logik, type LetzterSchritt } from "./logik.tsx";

const TRACE_LIMIT = 300;

/** Letzten Trace-Schritt je Knoten einarbeiten ("seite/knoten" → Schritt). */
function schritteAus(
  traces: Trace[],
  alt: Record<string, LetzterSchritt>,
): Record<string, LetzterSchritt> {
  const neu = { ...alt };
  for (const t of traces) {
    for (const s of t.schritte) {
      const bisher = neu[s.knoten];
      if (bisher && bisher.traceNr > t.nr) continue;
      neu[s.knoten] = {
        ts: t.gestartet,
        traceNr: t.nr,
        eingaenge: s.eingaenge,
        ausgaenge: s.ausgaenge,
        fehler: s.fehler,
      };
    }
  }
  return neu;
}

function Kopf({ status, live }: { status: Status | null; live: boolean }) {
  const knx = status?.knx;
  const mqtt = status?.mqtt;
  const beobachtung = knx?.modus === "beobachten";
  return (
    <header class="kopf">
      <div>
        <strong>Fachwerk</strong>{" "}
        <span class="schwach">{status ? status.gewerk : "lädt …"}</span>
      </div>
      <div class="kopf-status">
        {beobachtung && <span class="marke marke-beobachtung">BEOBACHTUNG · sendet nie</span>}
        {knx && (
          <span class={knx.verbunden ? "ok" : "fehler"}>
            KNX {knx.verbunden ? "verbunden" : "getrennt"}
            {knx.adresse ? ` (${knx.adresse}, Kanal ${knx.kanal})` : ""}
          </span>
        )}
        {mqtt && (
          <span class={mqtt.verbunden ? "ok" : "fehler"}>
            MQTT {mqtt.verbunden ? `verbunden (${mqtt.topics} Topics)` : "getrennt"}
          </span>
        )}
        {status && <span class="schwach">seit {dauer(status.uptimeMs)}</span>}
        <span class={live ? "ok" : "warn"}>{live ? "● live" : "○ offline"}</span>
      </div>
    </header>
  );
}

type Ansicht = "datenpunkte" | "traces" | "logik";

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dps, setDps] = useState<DatenpunktSicht[]>([]);
  const [geaendert, setGeaendert] = useState<Record<string, number>>({});
  const [live, setLive] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>("datenpunkte");
  const [gewerk, setGewerk] = useState<GewerkStruktur | null>(null);
  // Letzter Schritt je Knoten — läuft an der Trace-Pause VORBEI, damit der
  // Logik-Monitor immer live bleibt (Pause gehört zur Trace-Ansicht).
  const [schritte, setSchritte] = useState<Record<string, LetzterSchritt>>({});

  const [traces, setTraces] = useState<Trace[]>([]);
  const [pausiert, setPausiert] = useState(false);
  const [wartend, setWartend] = useState(0);
  // Während der Pause laufen neue Traces in diesen Puffer statt in die Ansicht —
  // die Liste bleibt exakt stehen (scrollstabil), nichts geht verloren.
  const puffer = useRef<Trace[]>([]);
  const pausiertRef = useRef(false);

  // Erstladen + Status-Refresh
  useEffect(() => {
    let aktiv = true;
    const laden = async (): Promise<void> => {
      try {
        const [s, d, t, g] = await Promise.all([
          api.status(),
          api.datenpunkte(),
          api.traces(100),
          api.gewerk(),
        ]);
        if (!aktiv) return;
        setStatus(s);
        setDps(d.datenpunkte);
        setTraces([...t.traces].sort((a, b) => b.nr - a.nr));
        setSchritte((alt) => schritteAus(t.traces, alt));
        setGewerk(g);
        setFehler(null);
      } catch (e) {
        if (aktiv) setFehler(e instanceof Error ? e.message : String(e));
      }
    };
    void laden();
    const t = setInterval(() => void api.status().then(setStatus).catch(() => {}), 5000);
    return () => {
      aktiv = false;
      clearInterval(t);
    };
  }, []);

  // Live-Kanal: Werte immer anwenden, Traces nur wenn nicht pausiert
  useEffect(() => {
    return verbindeLive((n: LiveNachricht) => {
      if (n.art === "wert") {
        setDps((alt) =>
          alt.map((d) => (d.schluessel === n.schluessel ? { ...d, wert: n.wert, ts: n.ts } : d)),
        );
        setGeaendert((alt) => ({ ...alt, [n.schluessel]: Date.now() }));
        return;
      }
      if (n.art === "trace") {
        setSchritte((alt) => schritteAus([n.trace], alt));
        if (pausiertRef.current) {
          puffer.current.push(n.trace);
          setWartend(puffer.current.length);
        } else {
          setTraces((alt) => [n.trace, ...alt].slice(0, TRACE_LIMIT));
        }
      }
    }, setLive);
  }, []);

  const setzePause = (an: boolean): void => {
    pausiertRef.current = an;
    setPausiert(an);
    if (!an && puffer.current.length > 0) {
      const neu = puffer.current.splice(0).reverse();
      setTraces((alt) => [...neu, ...alt].slice(0, TRACE_LIMIT));
    }
    if (!an) setWartend(0);
  };

  return (
    <>
      <Kopf status={status} live={live} />
      <nav class="tabs">
        <button aria-pressed={ansicht === "datenpunkte"} onClick={() => setAnsicht("datenpunkte")}>
          Datenpunkte
        </button>
        <button aria-pressed={ansicht === "traces"} onClick={() => setAnsicht("traces")}>
          Traces{pausiert && wartend > 0 ? ` (${wartend})` : ""}
        </button>
        <button aria-pressed={ansicht === "logik"} onClick={() => setAnsicht("logik")}>
          Logik
        </button>
      </nav>
      {fehler && <div class="karte fehler meldung">API nicht erreichbar: {fehler}</div>}
      <main>
        {/* Beide Ansichten bleiben gemountet: Tab-Wechsel verliert weder
            Filter/Sortierung noch die Scroll-Position oder ein offenes Detail. */}
        <section hidden={ansicht !== "datenpunkte"}>
          <Datenpunkte dps={dps} geaendert={geaendert} />
        </section>
        <section hidden={ansicht !== "traces"}>
          <Traces traces={traces} pausiert={pausiert} wartend={wartend} setzePause={setzePause} />
        </section>
        <section hidden={ansicht !== "logik"}>
          <Logik gewerk={gewerk} dps={dps} schritte={schritte} />
        </section>
      </main>
    </>
  );
}

render(<App />, document.getElementById("app")!);
