/** Kleine Anzeige-Helfer der Admin-UI (bewusst ohne Format-Kaskade — die
 *  gehört zur Visu; der Monitor zeigt Rohwerte, wie die Engine sie sieht). */
import type { Wert } from "../lib/api.ts";

export function dauer(ms: number): string {
  const s = Math.floor(ms / 1000);
  const t = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (t > 0) return `${t}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export function zeit(ts: number | null): string {
  if (ts === null) return "—";
  return new Date(ts).toLocaleTimeString("de-DE", { hour12: false });
}

export function wertText(w: Wert | null | undefined): string {
  if (w === null || w === undefined) return "—";
  if (typeof w === "boolean") return w ? "an" : "aus";
  return String(w);
}
