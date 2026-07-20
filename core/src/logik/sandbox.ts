/**
 * Baustein-Sandbox (P4-5, ADR-0008): führt Community-Bausteine (plain JS)
 * in einem Worker-Thread aus — mit Speicher-Limit (resourceLimits) und
 * hartem Zeitlimit je Aufruf (Atomics.wait-Timeout ⇒ Worker-Kill). Der
 * RPC ist synchron, damit Bausteine nahtlos in Kaskaden (E-2/E-3) laufen.
 */
import { Worker, MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import type { MessagePort } from "node:worker_threads";
import type { Wert } from "../datenpunkte/registry.ts";
import type { Ausloeser, Ausgaenge, Baustein, Eingaenge } from "./bausteine.ts";
import type { AufgeloesteFaehigkeiten } from "./faehigkeiten.ts";

export interface SandboxOptionen {
  /** Zeitlimit je Aufruf in ms (Default 100). */
  zeitlimitMs?: number;
  /** Heap-Limit des Workers in MB (Default 64). */
  speicherMb?: number;
  /** Deklarierte Faehigkeiten (ADR-0014 V-1); fehlt = kein Netz. */
  faehigkeiten?: AufgeloesteFaehigkeiten;
}

type TimerBefehl = { art: "plane"; id: string; ms: number } | { art: "brichab"; id: string };

interface NetzBefehl {
  id: string;
  url: string;
  methode?: string;
  kopfzeilen?: Record<string, string>;
  koerper?: string;
}

type SandboxAntwort =
  | {
      ausgaenge: Ausgaenge | null;
      zustand: Record<string, Wert>;
      timerBefehle: TimerBefehl[];
      netzBefehle?: NetzBefehl[];
    }
  | { fehler: string };

export class BausteinSandbox {
  readonly #zeitlimitMs: number;
  #worker: Worker | null;
  readonly #port: MessagePort;
  readonly #signal: Int32Array<SharedArrayBuffer>;
  #bereit = false;

  constructor(jsPfad: string, opts: SandboxOptionen = {}) {
    this.#zeitlimitMs = opts.zeitlimitMs ?? 100;
    const { port1, port2 } = new MessageChannel();
    this.#port = port1;
    this.#signal = new Int32Array(new SharedArrayBuffer(8));
    this.#worker = new Worker(new URL("./sandbox-worker.ts", import.meta.url), {
      workerData: {
        jsPfad,
        port: port2,
        signal: this.#signal,
        ...(opts.faehigkeiten ? { faehigkeiten: opts.faehigkeiten } : {}),
      },
      transferList: [port2],
      resourceLimits: {
        maxOldGenerationSizeMb: opts.speicherMb ?? 64,
        maxYoungGenerationSizeMb: 16,
      },
    });
    this.#worker.unref();
  }

  /** Synchroner Rechenaufruf; bei Zeitüberschreitung wird der Worker beendet. */
  rechne(auftrag: {
    eingaenge: Eingaenge;
    parameter: Readonly<Record<string, unknown>>;
    zustand: Record<string, Wert>;
    ausloeser: Ausloeser;
    frischeEingaenge?: string[];
  }): SandboxAntwort {
    if (!this.#worker) return { fehler: "Sandbox wurde beendet (vorheriger Verstoß?)" };

    if (!this.#bereit) {
      const r = Atomics.wait(this.#signal, 1, 0, 5000);
      const status = Atomics.load(this.#signal, 1);
      if (r === "timed-out" || status === 2) {
        const meldung = receiveMessageOnPort(this.#port)?.message as
          | { fehler?: string }
          | undefined;
        this.beende();
        return { fehler: meldung?.fehler ?? "Baustein lädt nicht (Timeout)" };
      }
      this.#bereit = true;
    }

    Atomics.store(this.#signal, 0, 0);
    this.#port.postMessage(auftrag);
    const r = Atomics.wait(this.#signal, 0, 0, this.#zeitlimitMs);
    if (r === "timed-out") {
      this.beende();
      return { fehler: `Zeitlimit überschritten (${this.#zeitlimitMs} ms) — Worker beendet` };
    }
    const nachricht = receiveMessageOnPort(this.#port);
    return (nachricht?.message as SandboxAntwort) ?? { fehler: "keine Antwort vom Worker" };
  }

  beende(): void {
    void this.#worker?.terminate();
    this.#worker = null;
  }
}

/** Verpackt eine Sandbox als Engine-Baustein (synchron, Kontext-Brücke). */
export function sandboxAlsBaustein(
  typ: string,
  sandbox: BausteinSandbox,
  faehigkeiten?: AufgeloesteFaehigkeiten,
): Baustein {
  return {
    typ,
    ...(faehigkeiten ? { faehigkeiten } : {}),
    rechne(eingaenge, ctx) {
      const antwort = sandbox.rechne({
        eingaenge,
        parameter: ctx.parameter,
        zustand: { ...ctx.zustand },
        ausloeser: ctx.ausloeser,
        frischeEingaenge: [...ctx.frischeEingaenge],
      });
      if ("fehler" in antwort) {
        throw new Error(`Baustein „${typ}": ${antwort.fehler}`);
      }
      for (const k of Object.keys(ctx.zustand)) delete ctx.zustand[k];
      Object.assign(ctx.zustand, antwort.zustand);
      for (const t of antwort.timerBefehle) {
        if (t.art === "plane") ctx.planeTimer(t.id, t.ms);
        else ctx.brichAb(t.id);
      }
      // Netz-Auftraege gehen an die Engine — sie prueft die Allowlist und
      // stellt die Antwort spaeter als eigene Kaskade zu (ADR-0014 V-2).
      for (const n of antwort.netzBefehle ?? []) {
        ctx.netz.hole(n.id, n.url, {
          ...(n.methode !== undefined ? { methode: n.methode } : {}),
          ...(n.kopfzeilen !== undefined ? { kopfzeilen: n.kopfzeilen } : {}),
          ...(n.koerper !== undefined ? { koerper: n.koerper } : {}),
        });
      }
      return antwort.ausgaenge;
    },
  };
}
