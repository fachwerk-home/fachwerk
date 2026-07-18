/**
 * WS-Tests gegen einen ECHTEN Socket: Handshake, Server→Client-Frames
 * (inkl. 16-Bit-Länge), Client→Server maskiert, Ping/Pong, Close.
 */
import { createServer, type Server } from "node:http";
import { connect, type Socket } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { WsServer, type WsVerbindung } from "./websocket.ts";

let server: Server | null = null;
let client: Socket | null = null;
afterEach(() => {
  client?.destroy();
  client = null;
  server?.close();
  server = null;
});

/** Startet HTTP+WS und verbindet einen rohen Client; liefert beide Seiten. */
async function verbunden(): Promise<{
  ws: WsServer;
  verbindung: WsVerbindung;
  client: Socket;
  lies: (n?: number) => Promise<Buffer>;
}> {
  const ws = new WsServer();
  let verbindung: WsVerbindung | null = null;
  server = createServer();
  server.on("upgrade", (req, socket) => {
    verbindung = ws.behandleUpgrade(req, socket as Socket);
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;

  const sock = connect(port, "127.0.0.1");
  client = sock;
  await new Promise<void>((r) => sock.once("connect", () => r()));

  const puffer: Buffer[] = [];
  let warte: ((b: Buffer) => void) | null = null;
  sock.on("data", (c: Buffer) => {
    puffer.push(c);
    if (warte) {
      const b = Buffer.concat(puffer.splice(0));
      const f = warte;
      warte = null;
      f(b);
    }
  });
  const lies = (): Promise<Buffer> =>
    new Promise((r) => {
      if (puffer.length > 0) r(Buffer.concat(puffer.splice(0)));
      else warte = r;
    });

  const key = randomBytes(16).toString("base64");
  sock.write(
    `GET /api/ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
  );
  const antwort = (await lies()).toString("latin1");
  expect(antwort).toContain("101 Switching Protocols");
  const erwartet = createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  expect(antwort).toContain(`Sec-WebSocket-Accept: ${erwartet}`);

  await new Promise((r) => setTimeout(r, 20));
  return { ws, verbindung: verbindung!, client: sock, lies };
}

/** Maskierter Client→Server-Textframe (RFC 6455 verlangt Maskierung). */
function clientFrame(text: string, opcode = 0x81): Buffer {
  const nutz = Buffer.from(text, "utf8");
  const maske = randomBytes(4);
  const maskiert = Buffer.from(nutz);
  for (let i = 0; i < maskiert.length; i++) maskiert[i]! ^= maske[i % 4]!;
  return Buffer.concat([Buffer.from([opcode, 0x80 | nutz.length]), maske, maskiert]);
}

/** Text aus einem unmaskierten Server→Client-Frame lesen. */
function frameText(b: Buffer): string {
  let len = b[1]! & 0x7f;
  let off = 2;
  if (len === 126) {
    len = b.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    len = Number(b.readBigUInt64BE(2));
    off = 10;
  }
  return b.subarray(off, off + len).toString("utf8");
}

describe("WsServer", () => {
  it("Handshake steht, Server sendet Text-Frames (unmaskiert)", async () => {
    const { verbindung, lies } = await verbunden();
    verbindung.sende(JSON.stringify({ art: "wert", schluessel: "a.b", wert: true }));
    const frame = await lies();
    expect(frame[0]).toBe(0x81); // FIN + Text
    expect((frame[1]! & 0x80) === 0).toBe(true); // Server maskiert NIE
    expect(JSON.parse(frameText(frame))).toMatchObject({ art: "wert", wert: true });
  });

  it("lange Nutzlast nutzt 16-Bit-Länge", async () => {
    const { verbindung, lies } = await verbunden();
    const lang = "x".repeat(500);
    verbindung.sende(lang);
    const frame = await lies();
    expect(frame[1]! & 0x7f).toBe(126);
    expect(frameText(frame)).toHaveLength(500);
  });

  it("sendeAllen erreicht jede Verbindung", async () => {
    const { ws, lies } = await verbunden();
    expect(ws.anzahl).toBe(1);
    ws.sendeAllen("hallo");
    expect(frameText(await lies())).toBe("hallo");
  });

  it("beantwortet Ping mit Pong und verkraftet maskierte Client-Frames", async () => {
    const { client, lies } = await verbunden();
    client.write(clientFrame("egal")); // Text vom Client: wird verworfen
    client.write(clientFrame("hi", 0x89)); // Ping
    const antwort = await lies();
    expect(antwort[0]).toBe(0x8a); // Pong
    expect(antwort.subarray(2, 4).toString("utf8")).toBe("hi");
  });

  it("Close vom Client beendet die Verbindung sauber", async () => {
    const { ws, client } = await verbunden();
    client.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); // maskierter Close
    await new Promise((r) => setTimeout(r, 50));
    expect(ws.anzahl).toBe(0);
  });

  it("kaputter Upgrade-Request wird abgewiesen", async () => {
    const ws = new WsServer();
    let ergebnis: WsVerbindung | null = "nicht gesetzt" as unknown as WsVerbindung;
    server = createServer();
    server.on("upgrade", (req, socket) => {
      ergebnis = ws.behandleUpgrade(req, socket as Socket);
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const sock = connect(port, "127.0.0.1");
    client = sock;
    await new Promise<void>((r) => sock.once("connect", () => r()));
    sock.write("GET /api/ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    await new Promise((r) => setTimeout(r, 50));
    expect(ergebnis).toBeNull(); // kein Sec-WebSocket-Key
  });
});
