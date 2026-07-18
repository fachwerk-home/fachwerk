/**
 * API-Client (ADR-0009 A-1: die UI benutzt exakt die öffentliche API).
 * Gemeinsam für Admin-UI und Visu-Client.
 */
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
  wert: Wert | null;
  ts: number | null;
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

export interface GewerkStruktur {
  name: string;
  seiten: GewerkSeite[];
  bausteine: Array<{
    id: string;
    name: string;
    eingaenge: string[];
    ausgaenge: string[];
    beschreibung: string | null;
  }>;
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
  if (!antwort.ok) {
    throw new Error(`${antwort.status} ${antwort.statusText} bei ${pfad}`);
  }
  return (await antwort.json()) as T;
}

export const api = {
  status: () => hole<Status>("/api/status"),
  datenpunkte: (filter = "") =>
    hole<{ anzahl: number; datenpunkte: DatenpunktSicht[] }>(
      `/api/datenpunkte${filter ? `?filter=${encodeURIComponent(filter)}` : ""}`,
    ),
  traces: (n = 100) => hole<{ traces: Trace[] }>(`/api/traces?n=${n}`),
  gewerk: () => hole<GewerkStruktur>("/api/gewerk"),
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
