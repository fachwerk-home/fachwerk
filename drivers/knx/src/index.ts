/**
 * @fachwerk/driver-knx — KNXnet/IP-Tunneling-Client (S-5, SPEC-007), minimal:
 * CONNECT/DISCONNECT, Heartbeat, GroupValueWrite senden/empfangen (DPT 1.001).
 * Entwickelt und getestet gegen den Bus-Simulator (SPEC-008). Läuft als
 * Treiber-Prozess im Fachwerk-Kern (ADR-0007: KNX gehört zum Core).
 */
export const DRIVER_ID = "knx";

export { KnxTreiber } from "./treiber.ts";
export type { KnxTreiberOptionen, KnxTelegramm } from "./treiber.ts";
export { gaZuZahl, zahlZuGa } from "./ga.ts";
export { encodeDpt, decodeDpt } from "./dpt.ts";
export type { Dpt, Apdu } from "./dpt.ts";
