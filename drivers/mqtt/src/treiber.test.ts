/**
 * MQTT-Treiber-Tests: byte-genau gegen einen In-Test-Mock-Broker (TCP).
 * Interop mit einem ECHTEN Broker (Mosquitto) beweist das E2E im Compose.
 */
import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { MqttTreiber, type MqttNachricht } from "./treiber.ts";
import { textZuWert, wertZuText } from "./wert.ts";

describe("Payload ↔ Wert", () => {
  it("bool versteht die üblichen Schreibweisen, lehnt Unsinn ab", () => {
    for (const t of ["1", "true", "ON", "An", "ein"]) expect(textZuWert("bool", t)).toBe(true);
    for (const t of ["0", "false", "Off", "aus"]) expect(textZuWert("bool", t)).toBe(false);
    expect(textZuWert("bool", "vielleicht")).toBeNull();
  });
  it("zahl und text", () => {
    expect(textZuWert("zahl", " 21.5 ")).toBe(21.5);
    expect(textZuWert("zahl", "abc")).toBeNull();
    expect(textZuWert("text", '{"x":1}')).toBe('{"x":1}');
    expect(wertZuText(true)).toBe("1");
    expect(wertZuText(21.5)).toBe("21.5");
  });
});

/** Minimaler MQTT-3.1.1-Broker für Tests: CONNACK, SUBACK, PUBLISH-Echo-API. */
class MockBroker {
  server: Server;
  port = 0;
  clients: Socket[] = [];
  connects: Buffer[] = [];
  subscribes: string[] = [];
  publishes: Array<{ topic: string; text: string }> = [];

  constructor() {
    this.server = createServer((sock) => {
      this.clients.push(sock);
      let puffer = Buffer.alloc(0);
      sock.on("data", (chunk: Buffer) => {
        puffer = Buffer.concat([puffer, chunk]);
        for (;;) {
          if (puffer.length < 2) return;
          let laenge = 0;
          let mult = 1;
          let i = 1;
          for (;;) {
            if (i >= puffer.length) return;
            const b = puffer[i]!;
            laenge += (b & 0x7f) * mult;
            mult *= 128;
            i++;
            if ((b & 0x80) === 0) break;
          }
          if (puffer.length < i + laenge) return;
          const typ = puffer[0]! & 0xf0;
          const body = puffer.subarray(i, i + laenge);
          puffer = puffer.subarray(i + laenge);

          if (typ === 0x10) {
            this.connects.push(Buffer.from(body));
            sock.write(Buffer.from([0x20, 0x02, 0x00, 0x00])); // CONNACK ok
          } else if (typ === 0x80) {
            const tl = (body[2]! << 8) | body[3]!;
            this.subscribes.push(body.subarray(4, 4 + tl).toString("utf8"));
            sock.write(Buffer.from([0x90, 0x03, body[0]!, body[1]!, 0x00])); // SUBACK
          } else if (typ === 0x30) {
            const tl = (body[0]! << 8) | body[1]!;
            this.publishes.push({
              topic: body.subarray(2, 2 + tl).toString("utf8"),
              text: body.subarray(2 + tl).toString("utf8"),
            });
          } else if (typ === 0xc0) {
            sock.write(Buffer.from([0xd0, 0x00])); // PINGRESP
          }
        }
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.port = (this.server.address() as { port: number }).port;
  }

  /** PUBLISH an alle verbundenen Clients (Broker → Client). */
  sende(topic: string, text: string): void {
    const t = Buffer.from(topic, "utf8");
    const p = Buffer.from(text, "utf8");
    const body = Buffer.concat([Buffer.from([t.length >> 8, t.length & 0xff]), t, p]);
    const kopf = Buffer.concat([Buffer.from([0x30]), Buffer.from([body.length]), body]);
    for (const c of this.clients) c.write(kopf);
  }

  stop(): void {
    for (const c of this.clients) c.destroy();
    this.server.close();
  }
}

let broker: MockBroker | null = null;
let treiber: MqttTreiber | null = null;
afterEach(() => {
  treiber?.trenne();
  treiber = null;
  broker?.stop();
  broker = null;
});

async function verbunden(opts: Partial<ConstructorParameters<typeof MqttTreiber>[0]> = {}) {
  broker = new MockBroker();
  await broker.start();
  treiber = new MqttTreiber({ host: "127.0.0.1", port: broker.port, clientId: "test", ...opts });
  await treiber.verbinde();
  return { broker, treiber };
}

describe("MqttTreiber", () => {
  it("CONNECT/CONNACK-Handshake, Subscribe, Publish (byte-genau)", async () => {
    const { broker, treiber } = await verbunden();
    expect(treiber.verbunden).toBe(true);
    // CONNECT: Protokollname MQTT, Level 4, Clean Session
    const c = broker.connects[0]!;
    expect(c.subarray(0, 7)).toEqual(Buffer.from([0, 4, 0x4d, 0x51, 0x54, 0x54, 4]));
    expect(c[7]! & 0x02).toBe(0x02);

    treiber.abonniere("fachwerk/+/status");
    treiber.publiziere("fachwerk/licht/set", "1");
    await new Promise((r) => setTimeout(r, 50));
    expect(broker.subscribes).toEqual(["fachwerk/+/status"]);
    expect(broker.publishes).toEqual([{ topic: "fachwerk/licht/set", text: "1" }]);
  });

  it("empfängt PUBLISH vom Broker", async () => {
    const nachrichten: MqttNachricht[] = [];
    const { broker } = await verbunden({ onNachricht: (n) => nachrichten.push(n) });
    broker.sende("haus/temp", "21.5");
    await new Promise((r) => setTimeout(r, 50));
    expect(nachrichten).toMatchObject([{ topic: "haus/temp", text: "21.5" }]);
  });

  it("Benutzer/Passwort landen im CONNECT", async () => {
    const { broker } = await verbunden({ benutzer: "fw", passwort: "geheim" });
    const c = broker.connects[0]!;
    expect(c[7]! & 0xc0).toBe(0xc0); // Username+Password-Flags
    expect(c.toString("utf8")).toContain("fw");
    expect(c.toString("utf8")).toContain("geheim");
  });

  it("Beobachtungsmodus: publiziert NIE, meldet Dry-Run", async () => {
    const dryRuns: Array<{ topic: string; text: string }> = [];
    const { broker, treiber } = await verbunden({
      beobachten: true,
      onWuerdeSenden: (topic, text) => dryRuns.push({ topic, text }),
    });
    treiber.publiziere("haus/licht/set", "1");
    await new Promise((r) => setTimeout(r, 50));
    expect(broker.publishes).toEqual([]);
    expect(dryRuns).toEqual([{ topic: "haus/licht/set", text: "1" }]);
  });

  it("Timeout ohne Broker", async () => {
    const t = new MqttTreiber({ host: "127.0.0.1", port: 1, clientId: "x" });
    await expect(t.verbinde(300)).rejects.toThrow(/Timeout/);
    t.trenne();
  });
});
