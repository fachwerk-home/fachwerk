/**
 * @fachwerk/driver-mqtt — MQTT-3.1.1-Client (ADR-0007: Core-Treiber neben
 * KNX). Eigenimplementierung ohne Fremdbibliothek; QoS 0, Keepalive,
 * Reconnect, Beobachtungsmodus. Datenpunkte: klasse bus, treiber mqtt,
 * adresse = Topic.
 */
export const DRIVER_ID = "mqtt";

export { MqttTreiber } from "./treiber.ts";
export type { MqttTreiberOptionen, MqttNachricht } from "./treiber.ts";
export { textZuWert, wertZuText } from "./wert.ts";
