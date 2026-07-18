import { useState } from "preact/hooks";
import type { Trace, TraceAusloeser } from "../lib/api.ts";
import { wertText, zeit } from "./format.ts";

function ausloeserText(a: TraceAusloeser): string {
  if (a.art === "dp") return `${a.schluessel} = ${wertText(a.wert)} (${a.quelle})`;
  if (a.art === "timer")
    return `Timer ${a.knoten}/${a.timer}${a.nachgeholt ? " (nachgeholt)" : ""}`;
  return "Fortsetzung (entkoppelter Baustein)";
}

function ausloeserMarke(a: TraceAusloeser): string {
  return a.art === "dp" ? "dp" : a.art;
}

function Detail({ trace }: { trace: Trace }) {
  return (
    <div class="trace-detail">
      <div class="trace-abschnitt">
        <h3>Schritte ({trace.schritte.length})</h3>
        {trace.schritte.length === 0 && <p class="schwach">Kein Baustein hat gefeuert.</p>}
        {trace.schritte.map((s, i) => (
          <div key={i} class="trace-schritt">
            <div class="trace-schritt-kopf">
              <span class="schwach">{i + 1}.</span> <strong>{s.knoten}</strong>
              {s.fehler && <span class="fehler"> Fehler: {s.fehler}</span>}
            </div>
            <div class="trace-io">
              <span class="schwach">ein:</span>{" "}
              {Object.entries(s.eingaenge).map(([k, v]) => (
                <span key={k} class="mono io-paar">
                  {k}={wertText(v)}
                </span>
              ))}
            </div>
            <div class="trace-io">
              <span class="schwach">aus:</span>{" "}
              {s.ausgaenge === null ? (
                <span class="schwach">— (kein Ergebnis)</span>
              ) : (
                Object.entries(s.ausgaenge).map(([k, v]) => (
                  <span key={k} class="mono io-paar">
                    {k}={wertText(v)}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      <div class="trace-abschnitt">
        <h3>Schreibvorgänge ({trace.schreibvorgaenge.length})</h3>
        {trace.schreibvorgaenge.length === 0 && <p class="schwach">Keine.</p>}
        {trace.schreibvorgaenge.map((w, i) => (
          <div key={i} class="trace-schreiben">
            <span class="mono">
              {w.schluessel} = {wertText(w.wert)}
            </span>{" "}
            <span class="schwach">von {w.von}</span>{" "}
            {w.angenommen ? (
              <span class="ok">✓</span>
            ) : (
              <span class="fehler">✗ {w.grund ?? "abgelehnt"}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Traces({
  traces,
  pausiert,
  wartend,
  setzePause,
}: {
  traces: Trace[];
  pausiert: boolean;
  wartend: number;
  setzePause: (an: boolean) => void;
}) {
  const [offen, setOffen] = useState<number | null>(null);

  // Detail ansehen heißt untersuchen — dabei darf die Liste nicht springen,
  // deshalb schaltet Aufklappen automatisch auf Pause (P5-4: scrollstabil).
  const klappe = (nr: number) => {
    setOffen((alt) => {
      const neu = alt === nr ? null : nr;
      if (neu !== null) setzePause(true);
      return neu;
    });
  };

  return (
    <>
      <div class="werkzeuge">
        <button aria-pressed={pausiert} onClick={() => setzePause(!pausiert)}>
          {pausiert ? "▶ weiter" : "⏸ Pause"}
        </button>
        {pausiert && wartend > 0 && (
          <span class="warn">{wartend} neue Kaskaden warten</span>
        )}
        {!pausiert && <span class="schwach">neueste zuerst, live</span>}
      </div>

      <div class="trace-liste">
        {traces.length === 0 && (
          <p class="schwach">Noch keine Kaskaden. Sobald die Logik feuert, erscheinen sie hier.</p>
        )}
        {traces.map((t) => (
          <div key={t.nr} class={`karte trace ${offen === t.nr ? "trace-offen" : ""}`}>
            <button class="trace-zeile" onClick={() => klappe(t.nr)}>
              <span class="schwach mono">#{t.nr}</span>
              <span class="schwach">{zeit(t.gestartet)}</span>
              <span class={`marke marke-${ausloeserMarke(t.ausloeser)}`}>
                {ausloeserMarke(t.ausloeser)}
              </span>
              <span class="trace-titel mono">{ausloeserText(t.ausloeser)}</span>
              <span class="schwach">
                {t.schritte.length} Schritte · {t.schreibvorgaenge.length} Schreiben ·{" "}
                {t.dauerMs} ms
              </span>
            </button>
            {offen === t.nr && <Detail trace={t} />}
          </div>
        ))}
      </div>
    </>
  );
}
