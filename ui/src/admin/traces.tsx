import { useEffect, useRef, useState } from "preact/hooks";
import type { Trace, TraceAusloeser } from "../lib/api.ts";
import { wertText, zeit } from "./format.ts";
import { berechneFenster } from "./virtualisierung.ts";

const TRACE_HOEHE = 44;

function ausloeserText(a: TraceAusloeser): string {
  if (a.art === "dp") return `${a.schluessel} = ${wertText(a.wert)} (${a.quelle})`;
  if (a.art === "timer") return `Timer ${a.knoten}/${a.timer}${a.nachgeholt ? " (nachgeholt)" : ""}`;
  return "Fortsetzung (entkoppelter Baustein)";
}

function ausloeserMarke(a: TraceAusloeser): string {
  return a.art === "dp" ? "dp" : a.art;
}

function Detail({ trace, schliessen }: { trace: Trace; schliessen: () => void }) {
  return (
    <aside class="detail-panel" aria-label={`Details zu Trace ${trace.nr}`}>
      <header class="detail-kopf">
        <div><span class="mono schwach">TRACE #{trace.nr}</span><strong>{ausloeserText(trace.ausloeser)}</strong></div>
        <button class="icon-knopf" aria-label="Details schließen" title="Schließen (Esc)" onClick={schliessen}>×</button>
      </header>
      <div class="trace-detail">
        <div class="trace-abschnitt">
          <h3>Schritte <span>{trace.schritte.length}</span></h3>
          {trace.schritte.length === 0 && <p class="schwach">Kein Baustein hat gefeuert.</p>}
          {trace.schritte.map((s, i) => (
            <div key={i} class="trace-schritt">
              <div><span class="schwach">{i + 1}.</span> <strong>{s.knoten}</strong>{s.fehler && <span class="fehler"> · {s.fehler}</span>}</div>
              <div class="trace-io"><span class="schwach">ein</span> {Object.entries(s.eingaenge).map(([k, v]) => <span key={k} class="mono io-paar">{k}={wertText(v)}</span>)}</div>
              <div class="trace-io"><span class="schwach">aus</span> {s.ausgaenge === null ? <span class="schwach">kein Ergebnis</span> : Object.entries(s.ausgaenge).map(([k, v]) => <span key={k} class="mono io-paar">{k}={wertText(v)}</span>)}</div>
            </div>
          ))}
        </div>
        <div class="trace-abschnitt">
          <h3>Schreibvorgänge <span>{trace.schreibvorgaenge.length}</span></h3>
          {trace.schreibvorgaenge.length === 0 && <p class="schwach">Keine Schreibvorgänge.</p>}
          {trace.schreibvorgaenge.map((w, i) => (
            <div key={i} class="trace-schreiben">
              <span class="mono">{w.schluessel} = {wertText(w.wert)}</span>{" "}
              <span class="schwach">von {w.von}</span>{" "}
              {w.angenommen ? <span class="ok">✓</span> : <span class="fehler">✗ {w.grund ?? "abgelehnt"}</span>}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function Traces({
  traces,
  pausiert,
  wartend,
  setzePause,
  escSignal,
}: {
  traces: Trace[];
  pausiert: boolean;
  wartend: number;
  setzePause: (an: boolean) => void;
  escSignal: number;
}) {
  const [offen, setOffen] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [hoehe, setHoehe] = useState(500);
  const listeRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOffen(null), [escSignal]);
  useEffect(() => {
    const element = listeRef.current;
    if (!element) return;
    const aktualisiere = (): void => setHoehe(element.clientHeight);
    aktualisiere();
    const beobachter = new ResizeObserver(aktualisiere);
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, []);

  const fenster = berechneFenster({
    anzahl: traces.length,
    scrollTop,
    viewportHoehe: hoehe,
    zeilenHoehe: TRACE_HOEHE,
    puffer: 6,
  });
  const detail = traces.find((trace) => trace.nr === offen);

  const klappe = (nr: number): void => {
    setOffen((alt) => alt === nr ? null : nr);
    setzePause(true);
  };

  return (
    <>
      <div class="werkzeuge">
        <button class="primaer" aria-pressed={pausiert} onClick={() => setzePause(!pausiert)}>
          {pausiert ? "▶ Fortsetzen" : "Ⅱ Pausieren"}
        </button>
        {pausiert && wartend > 0 && <span class="status-chip warn-chip">{wartend} neue Kaskaden</span>}
        <span class="schwach">{traces.length} Kaskaden · neueste zuerst</span>
      </div>

      <div class={`trace-arbeitsflaeche ${detail ? "mit-detail" : ""}`}>
        <div
          ref={listeRef}
          class="trace-liste"
          onScroll={(event) => setScrollTop((event.currentTarget as HTMLDivElement).scrollTop)}
        >
          <div style={{ height: fenster.oben }} aria-hidden="true" />
          {traces.slice(fenster.start, fenster.ende).map((trace) => (
            <button
              key={trace.nr}
              class={`trace-zeile ${offen === trace.nr ? "trace-offen" : ""}`}
              style={{ height: TRACE_HOEHE }}
              aria-pressed={offen === trace.nr}
              onClick={() => klappe(trace.nr)}
            >
              <span class="mono schwach">#{trace.nr}</span>
              <span class="schwach trace-zeit">{zeit(trace.gestartet)}</span>
              <span class={`marke marke-${ausloeserMarke(trace.ausloeser)}`}>{ausloeserMarke(trace.ausloeser)}</span>
              <span class="trace-titel mono">{ausloeserText(trace.ausloeser)}</span>
              <span class="schwach trace-meta">{trace.schritte.length} S · {trace.schreibvorgaenge.length} W · {trace.dauerMs} ms</span>
            </button>
          ))}
          <div style={{ height: fenster.unten }} aria-hidden="true" />
          {traces.length === 0 && <div class="leerzustand"><strong>Noch keine Kaskaden</strong><span>Live-Traces erscheinen hier, sobald die Logik feuert.</span></div>}
        </div>
        {detail && <Detail trace={detail} schliessen={() => setOffen(null)} />}
      </div>
    </>
  );
}
