/**
 * MQTT-Treiber (ADR-0007: Core neben KNX) — eigener MQTT-3.1.1-Client über
 * TCP, bewusst ohne Fremdbibliothek (wie der KNX-Treiber): QoS 0,
 * Username/Passwort optional, Keepalive (PINGREQ), automatischer Reconnect
 * mit Backoff. Für Gebäudeautomations-Raten mehr als ausreichend;
 * QoS 1/2 und TLS sind bewusst spätere Ausbaustufen.
 */
import { Socket, connect } from "node:net";

// Pakettypen (obere 4 Bit des ersten Bytes)
const CONNECT = 0x10;
const CONNACK = 0x20;
const PUBLISH = 0x30;
const SUBSCRIBE = 0x82; // inkl. Pflicht-Flags (QoS 1 Header-Bits der SUBSCRIBE)
const SUBACK = 0x90;
const PINGREQ = 0xc0;
const PINGRESP = 0xd0;
const DISCONNECT = 0xe0;

export interface MqttNachricht {
  topic: string;
  /** Payload als UTF-8-Text (Gebäudeautomation ist textlastig). */
  text: string;
  roh: Uint8Array;
}

export interface MqttTreiberOptionen {
  host: string;
  port?: number;
  clientId?: string;
  benutzer?: string;
  passwort?: string;
  /** Keepalive in Sekunden (Default 60). */
  keepalive?: number;
  onNachricht?: (n: MqttNachricht) => void;
  onStatus?: (verbunden: boolean, meldung: string) => void;
  /** Beobachtungsmodus: empfangen ja, publizieren NIE (Dry-Run-Meldung). */
  beobachten?: boolean;
  onWuerdeSenden?: (topic: string, text: string) => void;
}

/** UTF-8-String mit 2-Byte-Längenpräfix (MQTT-Stringformat). */
function mqttString(s: string): Buffer {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([Buffer.from([b.length >> 8, b.length & 0xff]), b]);
}

/** Remaining Length als Varint kodieren. */
function varint(n: number): Buffer {
  const bytes: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    bytes.push(b);
  } while (n > 0);
  return Buffer.from(bytes);
}

function paket(typ: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([typ]), varint(body.length), body]);
}

export class MqttTreiber {
  readonly #opts: Required<Pick<MqttTreiberOptionen, "host" | "port" | "clientId" | "keepalive">> &
    MqttTreiberOptionen;
  #socket: Socket | null = null;
  #puffer = Buffer.alloc(0);
  #verbunden = false;
  #beendet = false;
  #paketId = 0;
  #themen = new Set<string>();
  #ping: ReturnType<typeof setInterval> | null = null;
  #reconnect: ReturnType<typeof setTimeout> | null = null;
  #versuch = 0;

  constructor(opts: MqttTreiberOptionen) {
    this.#opts = {
      port: 1883,
      clientId: `fachwerk-${Math.trunc(performance.now() * 1000) % 1_000_000}`,
      keepalive: 60,
      ...opts,
    };
  }

  get verbunden(): boolean {
    return this.#verbunden;
  }

  get beobachtet(): boolean {
    return this.#opts.beobachten === true;
  }

  /** Verbindet (löst bei CONNACK auf) und hält die Verbindung danach selbst. */
  verbinde(timeoutMs = 5000): Promise<void> {
    this.#beendet = false;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout: kein CONNACK nach ${timeoutMs} ms`)),
        timeoutMs,
      );
      this.#oeffne(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  #oeffne(beiConnack?: () => void): void {
    const socket = connect(this.#opts.port, this.#opts.host);
    this.#socket = socket;
    this.#puffer = Buffer.alloc(0);

    socket.on("connect", () => {
      // CONNECT: MQTT 3.1.1, Clean Session; optional Benutzer/Passwort.
      let flags = 0x02;
      if (this.#opts.benutzer !== undefined) flags |= 0x80;
      if (this.#opts.passwort !== undefined) flags |= 0x40;
      const teile = [
        mqttString("MQTT"),
        Buffer.from([0x04, flags, this.#opts.keepalive >> 8, this.#opts.keepalive & 0xff]),
        mqttString(this.#opts.clientId),
      ];
      if (this.#opts.benutzer !== undefined) teile.push(mqttString(this.#opts.benutzer));
      if (this.#opts.passwort !== undefined) teile.push(mqttString(this.#opts.passwort));
      socket.write(paket(CONNECT, Buffer.concat(teile)));
    });

    socket.on("data", (chunk: Buffer) => {
      // Gleiche Verteidigungslinie wie beim KNX-Treiber: kaputte Pakete
      // dürfen den Prozess nie beenden.
      try {
        this.#puffer = Buffer.concat([this.#puffer, chunk]);
        this.#verarbeitePuffer(beiConnack);
      } catch (e) {
        this.#opts.onStatus?.(false, `Paket verworfen (${e instanceof Error ? e.message : e})`);
        this.#puffer = Buffer.alloc(0); // Parser-Zustand verwerfen, weiterleben
      }
      beiConnack = undefined; // nur beim ersten CONNACK auflösen
    });

    const neuVerbinden = (grund: string): void => {
      if (this.#verbunden || this.#versuch === 0) {
        this.#opts.onStatus?.(false, `Verbindung verloren (${grund})`);
      }
      this.#verbunden = false;
      if (this.#ping) clearInterval(this.#ping);
      this.#ping = null;
      socket.destroy();
      if (this.#beendet) return;
      const wartenMs = Math.min(30_000, 1000 * 2 ** Math.min(this.#versuch++, 5));
      this.#reconnect = setTimeout(() => this.#oeffne(), wartenMs);
      this.#reconnect.unref?.();
    };
    socket.on("error", (e) => neuVerbinden(e.message));
    socket.on("close", () => {
      if (!this.#beendet && this.#verbunden) neuVerbinden("Socket geschlossen");
    });
  }

  #verarbeitePuffer(beiConnack?: () => void): void {
    for (;;) {
      if (this.#puffer.length < 2) return;
      // Remaining Length dekodieren
      let laenge = 0;
      let mult = 1;
      let i = 1;
      for (;;) {
        if (i >= this.#puffer.length) return; // unvollständig
        const b = this.#puffer[i]!;
        laenge += (b & 0x7f) * mult;
        mult *= 128;
        i++;
        if ((b & 0x80) === 0) break;
      }
      if (this.#puffer.length < i + laenge) return; // Body unvollständig
      const typ = this.#puffer[0]! & 0xf0;
      const body = this.#puffer.subarray(i, i + laenge);
      this.#puffer = this.#puffer.subarray(i + laenge);

      if (typ === CONNACK) {
        const rc = body[1] ?? 255;
        if (rc === 0) {
          this.#verbunden = true;
          this.#versuch = 0;
          this.#opts.onStatus?.(true, "verbunden");
          // Keepalive + Themen (nach Reconnect erneut abonnieren)
          this.#ping = setInterval(
            () => this.#socket?.write(paket(PINGREQ, Buffer.alloc(0))),
            this.#opts.keepalive * 500, // halbes Keepalive
          );
          this.#ping.unref?.();
          for (const topic of this.#themen) this.#sendeSubscribe(topic);
          beiConnack?.();
        } else {
          this.#opts.onStatus?.(false, `CONNACK abgelehnt (rc=${rc})`);
        }
      } else if (typ === PUBLISH) {
        const topicLen = (body[0]! << 8) | body[1]!;
        const topic = body.subarray(2, 2 + topicLen).toString("utf8");
        // QoS 0: keine Packet-Id, Payload folgt direkt.
        const roh = Uint8Array.from(body.subarray(2 + topicLen));
        this.#opts.onNachricht?.({ topic, text: Buffer.from(roh).toString("utf8"), roh });
      } else if (typ === PINGRESP || typ === SUBACK) {
        // ok — nichts zu tun (QoS 0)
      }
    }
  }

  #sendeSubscribe(topic: string): void {
    this.#paketId = (this.#paketId % 0xffff) + 1;
    const body = Buffer.concat([
      Buffer.from([this.#paketId >> 8, this.#paketId & 0xff]),
      mqttString(topic),
      Buffer.from([0x00]), // QoS 0
    ]);
    this.#socket?.write(Buffer.concat([Buffer.from([SUBSCRIBE]), varint(body.length), body]));
  }

  /** Abonniert ein Topic (auch mit Wildcards +/#); übersteht Reconnects. */
  abonniere(topic: string): void {
    this.#themen.add(topic);
    if (this.#verbunden) this.#sendeSubscribe(topic);
  }

  /** Publiziert (QoS 0, nicht retained). Im Beobachtungsmodus: nur Dry-Run. */
  publiziere(topic: string, text: string): void {
    if (this.#opts.beobachten) {
      this.#opts.onWuerdeSenden?.(topic, text);
      return;
    }
    if (!this.#verbunden) return; // Reconnect läuft — QoS 0 heißt: darf verloren gehen
    const body = Buffer.concat([mqttString(topic), Buffer.from(text, "utf8")]);
    this.#socket?.write(paket(PUBLISH, body));
  }

  trenne(): void {
    this.#beendet = true;
    if (this.#ping) clearInterval(this.#ping);
    if (this.#reconnect) clearTimeout(this.#reconnect);
    this.#ping = null;
    this.#reconnect = null;
    if (this.#verbunden) this.#socket?.write(paket(DISCONNECT, Buffer.alloc(0)));
    this.#verbunden = false;
    this.#socket?.destroy();
    this.#socket = null;
  }
}
