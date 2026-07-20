/**
 * Sandbox-Worker (P4-5): lädt EINEN Nutzer-Baustein (plain JS, ESM,
 * default-Export rechne(eingaenge, ctx)) und beantwortet Rechenaufträge
 * synchron via SharedArrayBuffer-Signal. Seiteneffekte des Bausteins
 * laufen ausschließlich über den mitgegebenen Kontext und werden als
 * Befehle zurückgereicht — der Baustein erreicht weder Engine noch System.
 *
 * ADR-0014 V-2: Vor dem Laden des Bausteins werden die Wege nach draussen
 * aus dem globalen Scope entfernt. Das ist FLANKIEREND gemeint — zusammen
 * mit dem statischen Code-Check beim Laden faengt es Unfaelle und triviale
 * Bosheit. Es ist ausdruecklich KEINE Sicherheitsgrenze gegen einen
 * entschlossenen Angreifer; die kommt mit V-4 (eigener Prozess/WASM).
 */
import { workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import type { MessagePort } from "node:worker_threads";

interface WorkerDaten {
  jsPfad: string;
  port: MessagePort;
  signal: Int32Array<SharedArrayBuffer>;
  faehigkeiten?: { netzHosts: readonly string[]; zustand: boolean; timer: boolean };
}

const { jsPfad, port, signal, faehigkeiten } = workerData as WorkerDaten;
const darfNetz = (faehigkeiten?.netzHosts.length ?? 0) > 0;
const darfZustand = faehigkeiten?.zustand ?? true;
const darfTimer = faehigkeiten?.timer ?? true;

// ---- Scope haerten, BEVOR fremder Code laeuft (ADR-0014 V-2) ----------------
// Alles, was hier gebraucht wird, ist oben bereits importiert und in Konstanten
// festgehalten; der Baustein soll diese Wege nicht mehr finden.
const gesperrt = (was: string) => () => {
  throw new Error(
    `${was} ist in Bausteinen nicht verfuegbar (ADR-0014 V-2) — Netzzugriff laeuft ueber ctx.netz.hole`,
  );
};
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts"]) {
  Object.defineProperty(globalThis, name, {
    value: gesperrt(name),
    configurable: false,
    writable: false,
  });
}

type RechneFn = (
  eingaenge: Record<string, unknown>,
  ctx: Record<string, unknown>,
) => Record<string, unknown> | null | undefined;

let rechne: RechneFn | null = null;
try {
  const modul = (await import(pathToFileURL(jsPfad).href)) as { default?: unknown };
  if (typeof modul.default !== "function") {
    throw new Error("baustein.js braucht einen default-Export rechne(eingaenge, ctx)");
  }
  rechne = modul.default as RechneFn;
  Atomics.store(signal, 1, 1); // bereit
} catch (e) {
  port.postMessage({ fehler: `Baustein lädt nicht: ${e instanceof Error ? e.message : String(e)}` });
  Atomics.store(signal, 1, 2); // Ladefehler
}
Atomics.notify(signal, 1);

port.on("message", (auftrag: {
  eingaenge: Record<string, unknown>;
  parameter: Record<string, unknown>;
  zustand: Record<string, unknown>;
  ausloeser: unknown;
  frischeEingaenge?: string[];
}) => {
  let antwort: unknown;
  try {
    const timerBefehle: Array<
      { art: "plane"; id: string; ms: number } | { art: "brichab"; id: string }
    > = [];
    const netzBefehle: Array<{
      id: string;
      url: string;
      methode?: string;
      kopfzeilen?: Record<string, string>;
      koerper?: string;
    }> = [];
    const ctx = {
      parameter: auftrag.parameter,
      zustand: auftrag.zustand,
      ausloeser: auftrag.ausloeser,
      frischeEingaenge: new Set(auftrag.frischeEingaenge ?? []),
      planeTimer: (id: string, ms: number) => {
        if (!darfTimer) throw new Error("Baustein hat keine timer-Faehigkeit im Manifest");
        timerBefehle.push({ art: "plane", id, ms });
      },
      brichAb: (id: string) => {
        if (!darfTimer) throw new Error("Baustein hat keine timer-Faehigkeit im Manifest");
        timerBefehle.push({ art: "brichab", id });
      },
      netz: {
        hole: (
          id: string,
          url: string,
          optionen?: { methode?: string; kopfzeilen?: Record<string, string>; koerper?: string },
        ) => {
          // Die eigentliche Allowlist-Pruefung macht die Engine. Hier steht nur
          // die frueheste, billigste Absage — damit ein Baustein ohne
          // netz-Faehigkeit gar nicht erst Auftraege ansammelt.
          if (!darfNetz) throw new Error("Baustein hat keine netz-Faehigkeit im Manifest");
          if (typeof id !== "string" || typeof url !== "string") {
            throw new Error("ctx.netz.hole(id, url, optionen) braucht id und url als Text");
          }
          netzBefehle.push({ id, url, ...optionen });
        },
      },
    };
    const ausgaenge = rechne!(auftrag.eingaenge, ctx) ?? null;
    antwort = {
      ausgaenge,
      zustand: darfZustand ? auftrag.zustand : {},
      timerBefehle,
      netzBefehle,
    };
  } catch (e) {
    antwort = { fehler: e instanceof Error ? e.message : String(e) };
  }
  port.postMessage(antwort);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
});
