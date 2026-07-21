/**
 * API-Client (ADR-0009 A-1: die UI benutzt exakt die öffentliche API).
 * Gemeinsam für Admin-UI und Visu-Client.
 */
import type { WertFormat } from "../../../schema/src/visu.ts";

export interface TreiberStatus {
  verbunden: boolean;
  modus: "normal" | "beobachten";
  endpunkt?: string;
  adresse?: string;
  kanal?: number;
  topics?: number;
}

export interface Status {
  gewerk: string;
  version: string;
  uptimeMs: number;
  datenpunkte: number;
  logikseiten: number;
  bausteine: number;
  traces: { anzahl: number; kapazitaet: number };
  archive?: { anzahl: number };
  knx: TreiberStatus | null;
  mqtt: TreiberStatus | null;
}

export type Wert = boolean | number | string;

export interface DatenpunktSicht {
  schluessel: string;
  name: string;
  klasse: "intern" | "bus" | "system";
  typ: "bool" | "zahl" | "text";
  treiber?: string;
  adresse?: string;
  dpt?: string;
  protected?: boolean;
  remanent?: boolean;
  format?: WertFormat;
  wert: Wert | null;
  ts: number | null;
}

export interface SchreibAntwort {
  angenommen: boolean;
  schluessel?: string;
  wert?: Wert;
  geaendert?: boolean;
  hinweis?: string;
  fehler?: string;
}

export interface ApiFehlerDetails {
  fehler?: string | string[];
  angenommen?: boolean;
}

export class ApiFehler extends Error {
  readonly status: number;
  readonly koerper: ApiFehlerDetails;

  constructor(status: number, statusText: string, pfad: string, koerper: ApiFehlerDetails) {
    super(Array.isArray(koerper.fehler)
      ? koerper.fehler.join(" | ")
      : koerper.fehler ?? `${status} ${statusText} bei ${pfad}`);
    this.name = "ApiFehler";
    this.status = status;
    this.koerper = koerper;
  }
}

export interface ArchivEintrag {
  id: string;
  name: string;
  quelle: string;
  aufbewahrung_tage: number;
  mindestabstand_s?: number;
  punkte: number;
}

export interface ArchivPunkt {
  ts: number;
  wert: number;
  min?: number;
  max?: number;
  anzahl?: number;
}

export interface ArchivSerie {
  id: string;
  name: string;
  quelle: string;
  von: number;
  bis: number;
  rasterS: number;
  aggregation: "mittel" | "min" | "max" | "letzter";
  anzahl: number;
  punkte: ArchivPunkt[];
}

export interface GewerkDateiAntwort {
  inhalt: string;
}

export interface GewerkSchreibAntwort {
  angenommen: boolean;
  pfad?: string;
  aktiviert?: boolean;
  fehler?: string;
}

export interface GewerkAktivierenAntwort {
  angenommen: boolean;
  dauerMs?: number;
  fehler?: string[];
}

export interface TraceSchritt {
  knoten: string;
  eingaenge: Record<string, Wert | undefined>;
  ausgaenge: Record<string, Wert> | null;
  fehler?: string;
}

export interface TraceSchreiben {
  schluessel: string;
  wert: Wert;
  von: string;
  angenommen: boolean;
  grund?: string;
}

export type TraceAusloeser =
  | { art: "dp"; schluessel: string; wert: Wert; quelle: string }
  | { art: "timer"; knoten: string; timer: string; nachgeholt: boolean }
  | { art: "fortsetzung" };

export interface Trace {
  nr: number;
  ausloeser: TraceAusloeser;
  gestartet: number;
  dauerMs: number;
  schritte: TraceSchritt[];
  schreibvorgaenge: TraceSchreiben[];
}

export interface GewerkSeite {
  name: string;
  notizen: string | null;
  knoten: Array<{ id: string; baustein: string; parameter: Record<string, unknown> }>;
  kanten: Array<{ von: string; nach: string; trigger?: string }>;
}

export interface GewerkBaustein {
  id: string;
  name: string;
  eingaenge: string[];
  ausgaenge: string[];
  beschreibung: string | null;
  parameter?: Record<string, unknown>;
}

export interface GewerkStruktur {
  name: string;
  seiten: GewerkSeite[];
  bausteine: GewerkBaustein[];
}

export interface VisuAntwort {
  seiten: Record<string, unknown>;
  designs: Record<string, unknown>;
}

export interface IchAntwort {
  name: string;
  art: "sitzung" | "token" | "anonym";
  scopes: string[];
}

/** Token aus ?token= oder localStorage (DEV-Niveau, ADR-0009; P5-12 löst es ab). */
function token(): string | null {
  const ausUrl = new URLSearchParams(location.search).get("token");
  if (ausUrl) localStorage.setItem("fachwerk-token", ausUrl);
  return localStorage.getItem("fachwerk-token");
}

async function hole<T>(pfad: string): Promise<T> {
  const t = token();
  const antwort = await fetch(pfad, {
    headers: t ? { authorization: `Bearer ${t}` } : {},
  });
  const antwortKoerper = await antwort.json().catch(() => ({})) as ApiFehlerDetails;
  if (!antwort.ok) {
    throw new ApiFehler(antwort.status, antwort.statusText, pfad, antwortKoerper);
  }
  return antwortKoerper as T;
}

async function sende<T>(pfad: string, koerper: unknown): Promise<T> {
  const t = token();
  const antwort = await fetch(pfad, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(t ? { authorization: `Bearer ${t}` } : {}),
    },
    body: JSON.stringify(koerper),
  });
  const antwortKoerper = await antwort.json().catch(() => ({})) as ApiFehlerDetails;
  if (!antwort.ok) {
    throw new ApiFehler(antwort.status, antwort.statusText, pfad, antwortKoerper);
  }
  return antwortKoerper as T;
}

export const api = {
  status: () => hole<Status>("/api/status"),
  datenpunkte: (filter = "") =>
    hole<{ anzahl: number; datenpunkte: DatenpunktSicht[] }>(
      `/api/datenpunkte${filter ? `?filter=${encodeURIComponent(filter)}` : ""}`,
    ),
  traces: (n = 100) => hole<{ traces: Trace[] }>(`/api/traces?n=${n}`),
  ich: () => hole<IchAntwort>("/api/ich"),
  gewerk: () => hole<GewerkStruktur>("/api/gewerk"),
  visu: <T = VisuAntwort>() => hole<T>("/api/visu"),
  setzeDatenpunkt: (schluessel: string, wert: Wert) =>
    sende<SchreibAntwort>(`/api/datenpunkte/${encodeURIComponent(schluessel)}`, { wert }),
  gewerkDatei: (pfad: string) =>
    hole<GewerkDateiAntwort>(`/api/gewerk/dateien/${encodeURIComponent(pfad)}`),
  schreibeGewerkDatei: (pfad: string, inhalt: string) =>
    sende<GewerkSchreibAntwort>("/api/gewerk/dateien", { pfad, inhalt }),
  aktiviereGewerk: () => sende<GewerkAktivierenAntwort>("/api/gewerk/aktivieren", {}),
  archive: () => hole<{ anzahl: number; archive: ArchivEintrag[] }>("/api/archive"),
  archivSerie: (
    id: string,
    optionen: { von: number; bis: number; rasterS: number; aggregation?: ArchivSerie["aggregation"] },
  ) => {
    const query = new URLSearchParams({
      von: String(Math.round(optionen.von)),
      bis: String(Math.round(optionen.bis)),
      rasterS: String(Math.max(0, Math.round(optionen.rasterS))),
      aggregation: optionen.aggregation ?? "mittel",
    });
    return hole<ArchivSerie>(`/api/archive/${encodeURIComponent(id)}?${query}`);
  },
};

// ---- Live-Kanal --------------------------------------------------------------

export type LiveNachricht =
  | { art: "wert"; schluessel: string; wert: Wert; quelle: string; ts: number }
  | { art: "trace"; trace: Trace };

/**
 * WebSocket mit automatischem Reconnect (Backoff). Die UI soll nach einem
 * Neustart des Dienstes von selbst wieder live sein.
 */
export function verbindeLive(
  beiNachricht: (n: LiveNachricht) => void,
  beiStatus?: (verbunden: boolean) => void,
): () => void {
  let ws: WebSocket | null = null;
  let versuch = 0;
  let beendet = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const oeffne = (): void => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/api/ws`);
    ws.onopen = () => {
      versuch = 0;
      beiStatus?.(true);
    };
    ws.onmessage = (ev) => {
      try {
        beiNachricht(JSON.parse(String(ev.data)) as LiveNachricht);
      } catch {
        /* kaputte Nachricht ignorieren */
      }
    };
    ws.onclose = () => {
      beiStatus?.(false);
      if (beendet) return;
      const wartenMs = Math.min(10_000, 500 * 2 ** Math.min(versuch++, 4));
      timer = setTimeout(oeffne, wartenMs);
    };
    ws.onerror = () => ws?.close();
  };
  oeffne();

  return () => {
    beendet = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}
