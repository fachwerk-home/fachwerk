/**
 * Sandbox-Worker (P4-5): lädt EINEN Nutzer-Baustein (plain JS, ESM,
 * default-Export rechne(eingaenge, ctx)) und beantwortet Rechenaufträge
 * synchron via SharedArrayBuffer-Signal. Seiteneffekte des Bausteins
 * laufen ausschließlich über den mitgegebenen Kontext und werden als
 * Befehle zurückgereicht — der Baustein erreicht weder Engine noch System.
 */
import { workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import type { MessagePort } from "node:worker_threads";

interface WorkerDaten {
  jsPfad: string;
  port: MessagePort;
  signal: Int32Array<SharedArrayBuffer>;
}

const { jsPfad, port, signal } = workerData as WorkerDaten;

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
}) => {
  let antwort: unknown;
  try {
    const timerBefehle: Array<
      { art: "plane"; id: string; ms: number } | { art: "brichab"; id: string }
    > = [];
    const ctx = {
      parameter: auftrag.parameter,
      zustand: auftrag.zustand,
      ausloeser: auftrag.ausloeser,
      planeTimer: (id: string, ms: number) => timerBefehle.push({ art: "plane", id, ms }),
      brichAb: (id: string) => timerBefehle.push({ art: "brichab", id }),
    };
    const ausgaenge = rechne!(auftrag.eingaenge, ctx) ?? null;
    antwort = { ausgaenge, zustand: auftrag.zustand, timerBefehle };
  } catch (e) {
    antwort = { fehler: e instanceof Error ? e.message : String(e) };
  }
  port.postMessage(antwort);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
});
