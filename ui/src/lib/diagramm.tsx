import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { api, type ArchivPunkt, type ArchivSerie, type LiveNachricht } from "./api.ts";

const ZOOM_OPTIONEN = [
  { label: "24 h", stunden: 24 },
  { label: "7 T", stunden: 24 * 7 },
  { label: "30 T", stunden: 24 * 30 },
] as const;

type LiveWert = Extract<LiveNachricht, { art: "wert" }>;

export interface Skala {
  min: number;
  max: number;
}

export function skalaFuer(punkte: readonly ArchivPunkt[]): Skala {
  if (punkte.length === 0) return { min: 0, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const punkt of punkte) {
    min = Math.min(min, punkt.min ?? punkt.wert);
    max = Math.max(max, punkt.max ?? punkt.wert);
  }
  if (min === max) {
    const polster = Math.max(1, Math.abs(min) * 0.08);
    return { min: min - polster, max: max + polster };
  }
  const polster = (max - min) * 0.08;
  return { min: min - polster, max: max + polster };
}

export function rasterFuerBreite(von: number, bis: number, breite: number): number {
  const sekunden = Math.max(1, (bis - von) / 1000);
  const zielpunkte = Math.max(48, Math.floor(Math.max(1, breite) / 2));
  return Math.max(1, Math.ceil(sekunden / zielpunkte));
}

export function pfadFuerPunkte(
  punkte: readonly ArchivPunkt[],
  von: number,
  bis: number,
  breite: number,
  hoehe: number,
  skala: Skala,
): string {
  const zeitspanne = Math.max(1, bis - von);
  const wertspanne = Math.max(1, skala.max - skala.min);
  return punkte
    .map((punkt, index) => {
      const x = ((punkt.ts - von) / zeitspanne) * breite;
      const y = hoehe - ((punkt.wert - skala.min) / wertspanne) * hoehe;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function zeitformat(stunden: number): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("de-DE", stunden <= 48
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit" });
}

function wertText(wert: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(wert);
}

function findeNaechsten(punkte: readonly ArchivPunkt[], ts: number): ArchivPunkt | null {
  let bester: ArchivPunkt | null = null;
  let abstand = Infinity;
  for (const punkt of punkte) {
    const d = Math.abs(punkt.ts - ts);
    if (d < abstand) {
      abstand = d;
      bester = punkt;
    }
  }
  return bester;
}

export function Diagramm({
  archivId,
  startStunden = 24,
  liveNachricht,
  klasse = "",
}: {
  archivId: string | undefined;
  startStunden?: number;
  liveNachricht?: LiveWert | null;
  klasse?: string;
}) {
  const [stunden, setStunden] = useState(startStunden);
  const [serie, setSerie] = useState<ArchivSerie | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [breite, setBreite] = useState(640);
  const [hover, setHover] = useState<ArchivPunkt | null>(null);
  const rahmenRef = useRef<HTMLDivElement>(null);
  const letzteLiveRef = useRef<string | null>(null);

  useEffect(() => setStunden(startStunden), [startStunden, archivId]);

  useEffect(() => {
    const element = rahmenRef.current;
    if (!element) return;
    const aktualisiere = (): void => setBreite(Math.max(240, element.clientWidth));
    aktualisiere();
    const beobachter = new ResizeObserver(aktualisiere);
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, []);

  useEffect(() => {
    if (!archivId) return;
    let aktiv = true;
    const bis = Date.now();
    const von = bis - stunden * 60 * 60 * 1000;
    const rasterS = rasterFuerBreite(von, bis, breite);
    void api.archivSerie(archivId, { von, bis, rasterS })
      .then((antwort) => {
        if (!aktiv) return;
        setSerie(antwort);
        setFehler(null);
      })
      .catch((error: unknown) => {
        if (!aktiv) return;
        setFehler(error instanceof Error ? error.message : String(error));
      });
    return () => { aktiv = false; };
  }, [archivId, stunden, breite]);

  useEffect(() => {
    if (!liveNachricht || !serie || liveNachricht.schluessel !== serie.quelle) return;
    if (typeof liveNachricht.wert !== "number" && typeof liveNachricht.wert !== "boolean") return;
    const liveId = `${liveNachricht.schluessel}:${liveNachricht.ts}:${String(liveNachricht.wert)}`;
    if (letzteLiveRef.current === liveId) return;
    letzteLiveRef.current = liveId;
    const wert = typeof liveNachricht.wert === "boolean" ? (liveNachricht.wert ? 1 : 0) : liveNachricht.wert;
    const bis = Math.max(serie.bis, liveNachricht.ts);
    const von = bis - stunden * 60 * 60 * 1000;
    const punkt = { ts: liveNachricht.ts, wert };
    const punkte = [...serie.punkte.filter((p) => p.ts >= von && p.ts !== punkt.ts), punkt]
      .sort((a, b) => a.ts - b.ts);
    setSerie({ ...serie, von, bis, punkte, anzahl: punkte.length });
  }, [liveNachricht, serie, stunden]);

  const zeichnung = useMemo(() => {
    const punkte = serie?.punkte ?? [];
    const innenBreite = Math.max(1, breite - 54);
    const innenHoehe = 210;
    const skala = skalaFuer(punkte);
    const pfad = serie ? pfadFuerPunkte(punkte, serie.von, serie.bis, innenBreite, innenHoehe, skala) : "";
    const ticks = serie ? Array.from({ length: 5 }, (_, i) => serie.von + ((serie.bis - serie.von) * i) / 4) : [];
    return { punkte, innenBreite, innenHoehe, skala, pfad, ticks };
  }, [serie, breite]);

  const fmt = zeitformat(stunden);
  const titel = serie?.name ?? archivId ?? "Diagramm";
  const hatDaten = zeichnung.punkte.length > 0;
  const viewBox = `0 0 ${zeichnung.innenBreite + 54} ${zeichnung.innenHoehe + 34}`;

  const hoverText = hover
    ? `${new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(hover.ts)} · ${wertText(hover.wert)}`
    : null;

  const bewege = (event: JSX.TargetedPointerEvent<SVGSVGElement>): void => {
    if (!serie || zeichnung.punkte.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(0, event.clientX - rect.left - 42), zeichnung.innenBreite);
    const ts = serie.von + (x / zeichnung.innenBreite) * (serie.bis - serie.von);
    setHover(findeNaechsten(zeichnung.punkte, ts));
  };

  return (
    <div ref={rahmenRef} class={`diagramm ${klasse}`} data-leer={!hatDaten}>
      <div class="diagramm-kopf">
        <div>
          <strong>{titel}</strong>
          <span>{serie?.quelle ?? "Archiv"}</span>
        </div>
        <div class="segment" role="group" aria-label="Zeitraum">
          {ZOOM_OPTIONEN.map((option) => (
            <button
              key={option.stunden}
              type="button"
              aria-pressed={stunden === option.stunden}
              onClick={() => setStunden(option.stunden)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {fehler && <div class="diagramm-hinweis fehler">{fehler}</div>}
      {!fehler && !hatDaten && <div class="diagramm-hinweis">Keine Archivpunkte im Zeitraum.</div>}
      <svg
        class="diagramm-svg"
        viewBox={viewBox}
        role="img"
        aria-label={`${titel} Zeitreihe`}
        onPointerMove={bewege}
        onPointerLeave={() => setHover(null)}
      >
        <g transform="translate(42 10)">
          <line class="diagramm-achse" x1="0" y1={zeichnung.innenHoehe} x2={zeichnung.innenBreite} y2={zeichnung.innenHoehe} />
          <line class="diagramm-achse" x1="0" y1="0" x2="0" y2={zeichnung.innenHoehe} />
          {zeichnung.ticks.map((tick) => {
            const x = serie ? ((tick - serie.von) / Math.max(1, serie.bis - serie.von)) * zeichnung.innenBreite : 0;
            return (
              <g key={tick}>
                <line class="diagramm-gitter" x1={x} y1="0" x2={x} y2={zeichnung.innenHoehe} />
                <text class="diagramm-tick" x={x} y={zeichnung.innenHoehe + 20}>{fmt.format(tick)}</text>
              </g>
            );
          })}
          <text class="diagramm-y" x="-8" y="8">{wertText(zeichnung.skala.max)}</text>
          <text class="diagramm-y" x="-8" y={zeichnung.innenHoehe}>{wertText(zeichnung.skala.min)}</text>
          {hatDaten && <path class="diagramm-linie" d={zeichnung.pfad} />}
          {hover && serie && (
            <g>
              <line
                class="diagramm-cursor"
                x1={((hover.ts - serie.von) / Math.max(1, serie.bis - serie.von)) * zeichnung.innenBreite}
                y1="0"
                x2={((hover.ts - serie.von) / Math.max(1, serie.bis - serie.von)) * zeichnung.innenBreite}
                y2={zeichnung.innenHoehe}
              />
              <circle
                class="diagramm-punkt"
                cx={((hover.ts - serie.von) / Math.max(1, serie.bis - serie.von)) * zeichnung.innenBreite}
                cy={zeichnung.innenHoehe - ((hover.wert - zeichnung.skala.min) / Math.max(1, zeichnung.skala.max - zeichnung.skala.min)) * zeichnung.innenHoehe}
                r="4"
              />
            </g>
          )}
        </g>
      </svg>
      {hoverText && <div class="diagramm-tooltip">{hoverText}</div>}
    </div>
  );
}
