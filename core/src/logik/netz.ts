/**
 * Netz-Dienst fuer Bausteine (ADR-0014 V-2).
 *
 * Bausteine bekommen kein `fetch`. Sie sagen der Engine, WAS sie wollen, und
 * die Engine entscheidet, ob sie darf — gegen die Allowlist aus dem Manifest,
 * mit Timeout und Groessenlimit. Der Baustein sieht nie einen Socket.
 *
 * Der Aufruf ist bewusst nicht awaitbar: die Graph-Auswertung bleibt synchron
 * (ADR-0008 S-2). Die Antwort kommt spaeter als eigenes Ereignis zurueck und
 * loest eine neue Kaskade aus — genau wie ein Timer.
 */
import { netzZielErlaubt } from "./faehigkeiten.ts";

export interface NetzAuftrag {
  /** Vom Baustein vergebene Kennung, damit er die Antwort zuordnen kann. */
  id: string;
  url: string;
  methode?: string;
  kopfzeilen?: Record<string, string>;
  koerper?: string;
}

export interface NetzAntwort {
  id: string;
  ok: boolean;
  status: number;
  text: string;
  /** Gesetzt, wenn gar keine HTTP-Antwort zustande kam (Timeout, DNS, Allowlist). */
  fehler?: string;
}

export interface NetzGrenzen {
  hosts: readonly string[];
  timeoutMs?: number;
  maxBytes?: number;
}

/** Was die Engine braucht, um einen Auftrag auszufuehren. Injizierbar fuer Tests. */
export type NetzAusfuehrer = (auftrag: NetzAuftrag, grenzen: NetzGrenzen) => Promise<NetzAntwort>;

const STANDARD_TIMEOUT_MS = 10_000;
const STANDARD_MAX_BYTES = 256 * 1024;

/**
 * Echte Umsetzung mit fetch. Faellt nie mit einer Exception nach aussen —
 * ein unerreichbarer Dienst darf die Gebaeudesteuerung nicht mitreissen.
 */
export async function holeMitGrenzen(
  auftrag: NetzAuftrag,
  grenzen: NetzGrenzen,
): Promise<NetzAntwort> {
  const erlaubt = netzZielErlaubt(auftrag.url, grenzen.hosts);
  if (!erlaubt.ok) {
    return { id: auftrag.id, ok: false, status: 0, text: "", fehler: erlaubt.grund };
  }
  const timeoutMs = grenzen.timeoutMs ?? STANDARD_TIMEOUT_MS;
  const maxBytes = grenzen.maxBytes ?? STANDARD_MAX_BYTES;
  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), timeoutMs);
  try {
    const antwort = await fetch(erlaubt.ziel, {
      method: auftrag.methode ?? "GET",
      ...(auftrag.kopfzeilen ? { headers: auftrag.kopfzeilen } : {}),
      ...(auftrag.koerper !== undefined ? { body: auftrag.koerper } : {}),
      signal: abbruch.signal,
      redirect: "error", // Eine Umleitung koennte aus der Allowlist herausfuehren.
    });
    // Groessenlimit beim Lesen erzwingen, nicht erst danach: eine endlose
    // Antwort wuerde den Speicher fuellen, bevor irgendjemand pruefen kann.
    const text = await liesBegrenzt(antwort, maxBytes);
    return { id: auftrag.id, ok: antwort.ok, status: antwort.status, text };
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    return {
      id: auftrag.id,
      ok: false,
      status: 0,
      text: "",
      fehler: abbruch.signal.aborted ? `Zeitlimit ${timeoutMs} ms ueberschritten` : grund,
    };
  } finally {
    clearTimeout(wecker);
  }
}

async function liesBegrenzt(antwort: Response, maxBytes: number): Promise<string> {
  const koerper = antwort.body;
  if (!koerper) return "";
  const leser = koerper.getReader();
  const stuecke: Uint8Array[] = [];
  let gesamt = 0;
  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      if (value) {
        gesamt += value.byteLength;
        if (gesamt > maxBytes) {
          await leser.cancel();
          break;
        }
        stuecke.push(value);
      }
    }
  } finally {
    leser.releaseLock?.();
  }
  return new TextDecoder().decode(
    stuecke.reduce<Uint8Array>((a, b) => {
      const zusammen = new Uint8Array(a.length + b.length);
      zusammen.set(a);
      zusammen.set(b, a.length);
      return zusammen;
    }, new Uint8Array()),
  );
}
