/**
 * KNXnet/IP-Tunneling-Client (S-5): UDP, ein Socket für Steuer- und
 * Datenkanal (NAT-Modus: HPAI 0.0.0.0:0, Server antwortet an die
 * Paketquelle). Skeleton-Umfang: DPT 1.001 (Bool, 6-Bit-APDU).
 */
import { createSocket, type Socket } from "node:dgram";
import { gaZuZahl, zahlZuGa } from "./ga.ts";

const HEADER_LEN = 0x06;
const VERSION_10 = 0x10;

const CONNECT_REQUEST = 0x0205;
const CONNECT_RESPONSE = 0x0206;
const CONNECTIONSTATE_REQUEST = 0x0207; // Antwort-Überwachung/Reconnect: nach Phase 3
const DISCONNECT_REQUEST = 0x0209;
const DISCONNECT_RESPONSE = 0x020a;
const TUNNELING_REQUEST = 0x0420;
const TUNNELING_ACK = 0x0421;

const L_DATA_REQ = 0x11;
const L_DATA_IND = 0x29;

const APCI_WRITE = 0x080;
const APCI_RESPONSE = 0x040;

export interface KnxTelegramm {
  ga: string;
  /** Rohwert (Skeleton: 6-Bit / DPT 1.001). */
  wert: number;
  art: "write" | "response";
}

export interface KnxTreiberOptionen {
  host: string;
  port?: number;
  onTelegramm?: (t: KnxTelegramm) => void;
  onFehler?: (meldung: string) => void;
  /** Heartbeat-Intervall in ms (Default 60_000; Tests setzen kleiner). */
  heartbeatMs?: number;
}

/** HPAI im NAT-Modus: Server antwortet an die Paketquelle. */
const HPAI_NAT = Buffer.from([0x08, 0x01, 0, 0, 0, 0, 0, 0]);

function frame(service: number, body: Buffer): Buffer {
  const kopf = Buffer.alloc(6);
  kopf.writeUInt8(HEADER_LEN, 0);
  kopf.writeUInt8(VERSION_10, 1);
  kopf.writeUInt16BE(service, 2);
  kopf.writeUInt16BE(6 + body.length, 4);
  return Buffer.concat([kopf, body]);
}

export class KnxTreiber {
  readonly #opts: Required<Pick<KnxTreiberOptionen, "host" | "port" | "heartbeatMs">> &
    KnxTreiberOptionen;
  #socket: Socket | null = null;
  #kanal = -1;
  #sendeSeq = 0;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #verbunden = false;

  constructor(opts: KnxTreiberOptionen) {
    this.#opts = { port: 3671, heartbeatMs: 60_000, ...opts };
  }

  get verbunden(): boolean {
    return this.#verbunden;
  }

  async verbinde(timeoutMs = 3000): Promise<void> {
    const socket = createSocket("udp4");
    this.#socket = socket;
    socket.on("message", (msg) => this.#aufNachricht(msg));
    socket.on("error", (e) => this.#opts.onFehler?.(`Socket-Fehler: ${e.message}`));

    await new Promise<void>((resolve) => socket.bind(0, resolve));

    // CONNECT_REQUEST: HPAI Steuer + HPAI Daten + CRI (Tunnel, Link-Layer)
    const cri = Buffer.from([0x04, 0x04, 0x02, 0x00]);
    const antwort = await this.#anfrage(
      frame(CONNECT_REQUEST, Buffer.concat([HPAI_NAT, HPAI_NAT, cri])),
      CONNECT_RESPONSE,
      timeoutMs,
    );
    const status = antwort[7]!;
    if (status !== 0) {
      this.#socket?.close();
      this.#socket = null;
      throw new Error(`CONNECT abgelehnt: Status 0x${status.toString(16)}`);
    }
    this.#kanal = antwort[6]!;
    this.#sendeSeq = 0;
    this.#verbunden = true;

    this.#heartbeat = setInterval(() => this.#sendeHeartbeat(), this.#opts.heartbeatMs);
    this.#heartbeat.unref?.();
  }

  async trenne(): Promise<void> {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    if (this.#socket && this.#kanal >= 0) {
      const body = Buffer.concat([Buffer.from([this.#kanal, 0x00]), HPAI_NAT]);
      try {
        await this.#anfrage(frame(DISCONNECT_REQUEST, body), DISCONNECT_RESPONSE, 1000);
      } catch {
        // Server weg — Trennen ist trotzdem erfolgt.
      }
    }
    this.#socket?.close();
    this.#socket = null;
    this.#kanal = -1;
    this.#verbunden = false;
  }

  /** GroupValueWrite, DPT 1.001 (Skeleton). */
  sende(ga: string, wert: boolean): void {
    if (!this.#socket || this.#kanal < 0) throw new Error("nicht verbunden");
    const dst = gaZuZahl(ga);
    // cEMI L_Data.req: mc, addlen, ctrl1, ctrl2, src, dst, npdu_len, TPCI, APCI|wert
    const cemi = Buffer.from([
      L_DATA_REQ, 0x00, 0xbc, 0xe0,
      0x00, 0x00, // Quelladresse überlässt der Client dem Interface
      (dst >> 8) & 0xff, dst & 0xff,
      0x01, 0x00, APCI_WRITE | (wert ? 1 : 0),
    ]);
    const kopf = Buffer.from([0x04, this.#kanal, this.#sendeSeq, 0x00]);
    this.#sendeSeq = (this.#sendeSeq + 1) & 0xff;
    this.#sendeAnServer(frame(TUNNELING_REQUEST, Buffer.concat([kopf, cemi])));
  }

  #sendeAnServer(paket: Buffer): void {
    this.#socket?.send(paket, this.#opts.port, this.#opts.host);
  }

  #sendeHeartbeat(): void {
    if (this.#kanal < 0) return;
    const body = Buffer.concat([Buffer.from([this.#kanal, 0x00]), HPAI_NAT]);
    this.#sendeAnServer(frame(CONNECTIONSTATE_REQUEST, body));
  }

  /** Einmalige Anfrage: sendet und wartet auf den Service-Typ der Antwort. */
  #anfrage(paket: Buffer, erwartet: number, timeoutMs: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const socket = this.#socket!;
      const timer = setTimeout(() => {
        socket.off("message", horcher);
        reject(new Error(`Timeout: keine Antwort 0x${erwartet.toString(16)} nach ${timeoutMs} ms`));
      }, timeoutMs);
      const horcher = (msg: Buffer): void => {
        if (msg.length >= 6 && msg.readUInt16BE(2) === erwartet) {
          clearTimeout(timer);
          socket.off("message", horcher);
          resolve(msg);
        }
      };
      socket.on("message", horcher);
      this.#sendeAnServer(paket);
    });
  }

  #aufNachricht(msg: Buffer): void {
    if (msg.length < 6 || msg[0] !== HEADER_LEN) return;
    const service = msg.readUInt16BE(2);
    if (service !== TUNNELING_REQUEST) return;

    const kanal = msg[7]!;
    const seq = msg[8]!;
    // Sofort quittieren (Server wiederholt sonst)
    this.#sendeAnServer(frame(TUNNELING_ACK, Buffer.from([0x04, kanal, seq, 0x00])));

    const cemi = msg.subarray(10);
    if (cemi.length < 10 || cemi[0] !== L_DATA_IND) return; // .con u. a. ignorieren
    const addLen = cemi[1]!;
    const p = 2 + addLen;
    const dst = cemi.readUInt16BE(p + 4);
    const npduLen = cemi[p + 6]!;
    const apciHigh = cemi[p + 7 + 1];
    if (apciHigh === undefined) return;
    const apci = ((cemi[p + 7]! & 0x03) << 8) | apciHigh;
    const art = (apci & 0x3c0) === APCI_RESPONSE ? "response" : "write";

    const wert =
      npduLen === 1
        ? apciHigh & 0x3f
        : cemi.subarray(p + 9, p + 9 + npduLen - 1).reduce((a, b) => a * 256 + b, 0);

    this.#opts.onTelegramm?.({ ga: zahlZuGa(dst), wert, art });
  }
}
