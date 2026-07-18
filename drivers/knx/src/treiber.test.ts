/**
 * S-5-Tests: Framing gegen einen In-Test-Mock-Server (byte-genau).
 * Die Integration gegen den echten Bus-Simulator läuft in S-6 (Compose-E2E).
 */
import { createSocket, type Socket, type RemoteInfo } from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";
import { KnxTreiber, type KnxTelegramm } from "./treiber.ts";
import { gaZuZahl, zahlZuGa, zahlZuIa } from "./ga.ts";

describe("Gruppenadressen", () => {
  it("wandelt hin und zurück", () => {
    expect(gaZuZahl("1/0/1")).toBe(0x0801);
    expect(gaZuZahl("31/7/255")).toBe(0xffff);
    expect(zahlZuGa(0x0802)).toBe("1/0/2");
  });
  it("lehnt Unsinn ab", () => {
    expect(() => gaZuZahl("1/0")).toThrow();
    expect(() => gaZuZahl("32/0/0")).toThrow();
    expect(() => gaZuZahl("a/b/c")).toThrow();
  });

  it("Individualadresse: Bereich.Linie.Gerät", () => {
    expect(zahlZuIa(0x11fa)).toBe("1.1.250");
    expect(zahlZuIa(0x1105)).toBe("1.1.5"); // z. B. FHEM
    expect(zahlZuIa(0xffff)).toBe("15.15.255");
  });
});

/** Minimaler KNXnet/IP-Server für Tests: CONNECT, ACK, Empfangsprotokoll. */
class MockServer {
  socket: Socket;
  port = 0;
  empfangeneWrites: Array<{ dst: number; wert: number }> = [];
  empfangeneBytes: Array<{ dst: number; bytes: number[] }> = [];
  clientAcks: number[] = [];
  #client: RemoteInfo | null = null;

  constructor() {
    this.socket = createSocket("udp4");
    this.socket.on("message", (msg, rinfo) => this.#aufNachricht(msg, rinfo));
  }

  async start(): Promise<void> {
    await new Promise<void>((r) => this.socket.bind(0, "127.0.0.1", r));
    this.port = (this.socket.address() as { port: number }).port;
  }

  stop(): void {
    this.socket.close();
  }

  #frame(service: number, body: Buffer): Buffer {
    const kopf = Buffer.from([0x06, 0x10, 0, 0, 0, 0]);
    kopf.writeUInt16BE(service, 2);
    kopf.writeUInt16BE(6 + body.length, 4);
    return Buffer.concat([kopf, body]);
  }

  #aufNachricht(msg: Buffer, rinfo: RemoteInfo): void {
    const service = msg.readUInt16BE(2);
    this.#client = rinfo;
    if (service === 0x0205) {
      // CONNECT_RESPONSE: Kanal 7, ok, HPAI, CRD (Tunnel, IA 1.1.250)
      const body = Buffer.concat([
        Buffer.from([7, 0x00]),
        Buffer.from([0x08, 0x01, 127, 0, 0, 1, 0, 0]),
        Buffer.from([0x04, 0x04, 0x11, 0xfa]),
      ]);
      this.socket.send(this.#frame(0x0206, body), rinfo.port, rinfo.address);
    } else if (service === 0x0420) {
      const seq = msg[8]!;
      this.socket.send(
        this.#frame(0x0421, Buffer.from([0x04, msg[7]!, seq, 0x00])),
        rinfo.port,
        rinfo.address,
      );
      const cemi = msg.subarray(10);
      if (cemi[0] === 0x11) {
        // L_Data.req: byte-genau prüfen, was der Treiber sendet
        const dst = cemi.readUInt16BE(6);
        const npduLen = cemi[8]!;
        if (npduLen === 1) {
          this.empfangeneWrites.push({ dst, wert: cemi[10]! & 0x3f });
        } else {
          this.empfangeneBytes.push({
            dst,
            bytes: [...cemi.subarray(11, 11 + npduLen - 1)],
          });
        }
      }
    } else if (service === 0x0421) {
      this.clientAcks.push(msg[8]!);
    } else if (service === 0x0209) {
      this.socket.send(
        this.#frame(0x020a, Buffer.from([msg[6]!, 0x00])),
        rinfo.port,
        rinfo.address,
      );
    }
  }

  /** L_Data.ind an den verbundenen Client (wie Simulator.inject). */
  injiziere(ga: number, wert: number, seq: number): void {
    if (!this.#client) throw new Error("kein Client verbunden");
    const cemi = Buffer.from([
      0x29, 0x00, 0xbc, 0xe0, 0x11, 0x0a,
      (ga >> 8) & 0xff, ga & 0xff,
      0x01, 0x00, 0x80 | wert,
    ]);
    const body = Buffer.concat([Buffer.from([0x04, 7, seq, 0x00]), cemi]);
    this.socket.send(this.#frame(0x0420, body), this.#client.port, this.#client.address);
  }

  /** L_Data.ind mit Byte-Payload (z. B. DPT 9.001). */
  injiziereBytes(ga: number, bytes: number[], seq: number): void {
    if (!this.#client) throw new Error("kein Client verbunden");
    const cemi = Buffer.concat([
      Buffer.from([
        0x29, 0x00, 0xbc, 0xe0, 0x11, 0x0a,
        (ga >> 8) & 0xff, ga & 0xff,
        1 + bytes.length, 0x00, 0x80,
      ]),
      Buffer.from(bytes),
    ]);
    const body = Buffer.concat([Buffer.from([0x04, 7, seq, 0x00]), cemi]);
    this.socket.send(this.#frame(0x0420, body), this.#client.port, this.#client.address);
  }
}

let server: MockServer | null = null;
let treiber: KnxTreiber | null = null;
afterEach(async () => {
  await treiber?.trenne();
  treiber = null;
  server?.stop();
  server = null;
});

async function verbunden(onTelegramm?: (t: KnxTelegramm) => void) {
  server = new MockServer();
  await server.start();
  treiber = new KnxTreiber({
    host: "127.0.0.1",
    port: server.port,
    ...(onTelegramm ? { onTelegramm } : {}),
  });
  await treiber.verbinde();
  return { server, treiber };
}

describe("KnxTreiber", () => {
  it("verbindet (CONNECT-Handshake) und trennt sauber", async () => {
    const { treiber } = await verbunden();
    expect(treiber.verbunden).toBe(true);
    await treiber.trenne();
    expect(treiber.verbunden).toBe(false);
  });

  it("übernimmt die vom Router zugewiesene Individualadresse + Kanal", async () => {
    // MockServer antwortet mit Kanal 7 und CRD-IA 0x11FA = 1.1.250.
    const { treiber } = await verbunden();
    expect(treiber.kanal).toBe(7);
    expect(treiber.adresse).toBe("1.1.250");
    await treiber.trenne();
    expect(treiber.adresse).toBeNull();
  });

  it("sendet GroupValueWrite byte-genau (DPT 1.001)", async () => {
    const { server, treiber } = await verbunden();
    treiber.sende("1/0/2", true);
    treiber.sende("1/0/2", false);
    await new Promise((r) => setTimeout(r, 50));
    expect(server.empfangeneWrites).toEqual([
      { dst: 0x0802, wert: 1 },
      { dst: 0x0802, wert: 0 },
    ]);
  });

  it("empfängt L_Data.ind, meldet Telegramm und quittiert (ACK)", async () => {
    const telegramme: KnxTelegramm[] = [];
    const { server } = await verbunden((t) => telegramme.push(t));
    server.injiziere(gaZuZahl("1/0/1"), 1, 0);
    await new Promise((r) => setTimeout(r, 50));
    expect(telegramme).toMatchObject([{ ga: "1/0/1", wert: 1, art: "write" }]);
    expect([...telegramme[0]!.rohBytes]).toEqual([1]); // 6-Bit-Nutzlast
    expect(server.clientAcks).toEqual([0]);
  });

  it("meldet Timeout, wenn kein Server antwortet", async () => {
    const t = new KnxTreiber({ host: "127.0.0.1", port: 1 });
    await expect(t.verbinde(200)).rejects.toThrow(/Timeout/);
  });

  it("Beobachtungsmodus: empfängt, sendet aber NIE (nur Dry-Run-Meldung)", async () => {
    const empfangen: KnxTelegramm[] = [];
    const wuerdeSenden: Array<{ ga: string; wert: boolean | number }> = [];
    server = new MockServer();
    await server.start();
    treiber = new KnxTreiber({
      host: "127.0.0.1",
      port: server.port,
      beobachten: true,
      onTelegramm: (t) => empfangen.push(t),
      onWuerdeSenden: (ga, wert) => wuerdeSenden.push({ ga, wert }),
    });
    await treiber.verbinde();
    expect(treiber.beobachtet).toBe(true);

    // Empfang funktioniert normal:
    server.injiziere(gaZuZahl("1/0/1"), 1, 0);
    await new Promise((r) => setTimeout(r, 50));
    expect(empfangen).toMatchObject([{ ga: "1/0/1", wert: 1, art: "write" }]);

    // Senden überträgt NICHTS, meldet nur den Dry-Run:
    treiber.sende("1/0/2", true);
    treiber.sende("2/0/1", 42);
    await new Promise((r) => setTimeout(r, 50));
    expect(server.empfangeneWrites).toEqual([]);
    expect(server.empfangeneBytes).toEqual([]);
    expect(wuerdeSenden).toEqual([
      { ga: "1/0/2", wert: true },
      { ga: "2/0/1", wert: 42 },
    ]);
  });

  it("DPT 9.001: sendet 2-Byte-Payload und dekodiert Empfangenes (P4-4)", async () => {
    const telegramme: KnxTelegramm[] = [];
    server = new MockServer();
    await server.start();
    treiber = new KnxTreiber({
      host: "127.0.0.1",
      port: server.port,
      dpts: new Map([["2/0/1", "9.001"]]),
      onTelegramm: (t) => telegramme.push(t),
    });
    await treiber.verbinde();

    treiber.sende("2/0/1", 21.5);
    await new Promise((r) => setTimeout(r, 50));
    expect(server.empfangeneBytes).toEqual([
      { dst: gaZuZahl("2/0/1"), bytes: [0x0c, 0x33] },
    ]);

    server.injiziereBytes(gaZuZahl("2/0/1"), [0x0c, 0x33], 0);
    await new Promise((r) => setTimeout(r, 50));
    expect(telegramme).toMatchObject([{ ga: "2/0/1", wert: 21.5, art: "write" }]);
    expect([...telegramme[0]!.rohBytes]).toEqual([0x0c, 0x33]);
  });

  it("DPT-Payload-Konflikt: kein Crash, Rohwert + EINE Warnung je GA (Realbus-Bug)", async () => {
    // Genau der Absturz vom echten Bus: GA als 9.001 gemappt, aber es kommt
    // ein 6-Bit-Telegramm (falsches Mapping/zweiter Sender). Früher:
    // ungefangene Exception im UDP-Handler ⇒ Prozess tot ⇒ Restart-Loop.
    const telegramme: KnxTelegramm[] = [];
    const fehler: string[] = [];
    server = new MockServer();
    await server.start();
    treiber = new KnxTreiber({
      host: "127.0.0.1",
      port: server.port,
      dpts: new Map([["0/4/17", "9.001"]]),
      onTelegramm: (t) => telegramme.push(t),
      onFehler: (m) => fehler.push(m),
    });
    await treiber.verbinde();

    server.injiziere(gaZuZahl("0/4/17"), 1, 0); // 6-Bit statt 2 Byte
    server.injiziere(gaZuZahl("0/4/17"), 0, 1); // gleiche GA nochmal
    await new Promise((r) => setTimeout(r, 60));

    expect(telegramme).toHaveLength(2); // lebt weiter, liefert Rohwerte
    expect(telegramme[0]).toMatchObject({ ga: "0/4/17", wert: 1 });
    expect(fehler.filter((m) => m.includes("0/4/17"))).toHaveLength(1); // Dedup
    expect(fehler[0]).toContain("9.001");
  });

  it("ohne DPT: rohBytes sind maßgeblich, lange Nutzlast wird NICHT geraten", async () => {
    const telegramme: KnxTelegramm[] = [];
    const { server } = await verbunden((t) => telegramme.push(t));

    // 2 Byte ohne DPT-Karte → Ganzzahl als Notbehelf, rohBytes exakt.
    server.injiziereBytes(gaZuZahl("0/4/0"), [0x56, 0x7c], 0);
    // 14 Byte (z. B. DPT-16-Text) → frueher 1.58e+33; jetzt wert=0, rohBytes zaehlen.
    const lang = [0x4b, 0x4e, 0x58, 0x20, 0x54, 0x65, 0x78, 0x74, 0, 0, 0, 0, 0, 0];
    server.injiziereBytes(gaZuZahl("0/4/17"), lang, 1);
    await new Promise((r) => setTimeout(r, 50));

    expect(telegramme[0]).toMatchObject({ ga: "0/4/0", wert: 0x567c });
    expect([...telegramme[0]!.rohBytes]).toEqual([0x56, 0x7c]);

    expect(telegramme[1]!.wert).toBe(0); // kein Fantasiewert mehr
    expect([...telegramme[1]!.rohBytes]).toEqual(lang);
  });
});
