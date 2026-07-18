/**
 * WebSocket-Server (P5-3), RFC 6455, minimal und selbst gebaut — konsistent
 * zur Null-Dependency-Linie (KNX/MQTT sind ebenfalls Eigenimplementierungen).
 *
 * Umfang bewusst klein: Handshake, Text-Frames, Ping/Pong, Close. Kein
 * Fragment-Zusammenbau über mehrere Frames (senden wir nie), keine Kompression.
 * Client→Server-Nachrichten werden gelesen und verworfen (Kommandos: P5-8/P5-11).
 */
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

const MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Sendet einen unmaskierten Text-Frame (Server→Client ist immer unmaskiert). */
function textFrame(text: string): Buffer {
  const nutz = Buffer.from(text, "utf8");
  const len = nutz.length;
  let kopf: Buffer;
  if (len < 126) {
    kopf = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    kopf = Buffer.from([0x81, 126, len >> 8, len & 0xff]);
  } else {
    kopf = Buffer.alloc(10);
    kopf[0] = 0x81;
    kopf[1] = 127;
    kopf.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([kopf, nutz]);
}

const PONG = (nutz: Buffer): Buffer =>
  Buffer.concat([Buffer.from([0x8a, nutz.length]), nutz]); // < 126 genügt für Pings

export interface WsVerbindung {
  sende(text: string): void;
  schliesse(): void;
}

export class WsServer {
  readonly #verbindungen = new Set<{ socket: Socket }>();

  /** Erfüllt den Upgrade-Handshake; gibt die Verbindung zurück (oder null). */
  behandleUpgrade(req: IncomingMessage, socket: Socket): WsVerbindung | null {
    const key = req.headers["sec-websocket-key"];
    if (typeof key !== "string" || (req.headers.upgrade ?? "").toLowerCase() !== "websocket") {
      socket.destroy();
      return null;
    }
    const akzeptiert = createHash("sha1").update(key + MAGIC).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${akzeptiert}\r\n\r\n`,
    );
    socket.setNoDelay(true);

    const eintrag = { socket };
    this.#verbindungen.add(eintrag);

    let puffer: Buffer = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      try {
        puffer = Buffer.concat([puffer, chunk]);
        puffer = Buffer.from(this.#verarbeite(socket, puffer));
      } catch {
        socket.destroy(); // kaputter Frame: Verbindung weg, Dienst lebt
      }
    });
    const weg = (): void => void this.#verbindungen.delete(eintrag);
    socket.on("close", weg);
    socket.on("error", weg);

    return {
      sende: (text) => {
        if (!socket.destroyed) socket.write(textFrame(text));
      },
      schliesse: () => socket.destroy(),
    };
  }

  /** Frames aus dem Puffer verarbeiten; gibt den Rest zurück. */
  #verarbeite(socket: Socket, puffer: Buffer): Buffer {
    for (;;) {
      if (puffer.length < 2) return puffer;
      const opcode = puffer[0]! & 0x0f;
      const maskiert = (puffer[1]! & 0x80) !== 0;
      let len = puffer[1]! & 0x7f;
      let off = 2;
      if (len === 126) {
        if (puffer.length < 4) return puffer;
        len = puffer.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (puffer.length < 10) return puffer;
        len = Number(puffer.readBigUInt64BE(2));
        off = 10;
      }
      // Client→Server MUSS maskiert sein (RFC 6455).
      const maske = maskiert ? puffer.subarray(off, off + 4) : null;
      if (maskiert) off += 4;
      if (puffer.length < off + len) return puffer;

      const nutz = Buffer.from(puffer.subarray(off, off + len));
      if (maske) for (let i = 0; i < nutz.length; i++) nutz[i]! ^= maske[i % 4]!;
      puffer = puffer.subarray(off + len);

      if (opcode === 0x8) {
        socket.end(Buffer.from([0x88, 0x00])); // Close
        return Buffer.alloc(0);
      }
      if (opcode === 0x9) socket.write(PONG(nutz)); // Ping → Pong
      // Text/Binary/Pong vom Client: derzeit ohne Bedeutung (P5-8/P5-11).
    }
  }

  /** Sendet an alle offenen Verbindungen. */
  sendeAllen(text: string): void {
    const frame = textFrame(text);
    for (const { socket } of this.#verbindungen) {
      if (!socket.destroyed) socket.write(frame);
    }
  }

  get anzahl(): number {
    return this.#verbindungen.size;
  }

  schliesseAlle(): void {
    for (const { socket } of this.#verbindungen) socket.destroy();
    this.#verbindungen.clear();
  }
}
