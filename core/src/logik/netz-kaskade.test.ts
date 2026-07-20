/**
 * ADR-0014 V-2 am lebenden Objekt: Ein Baustein bittet ueber ctx.netz.hole um
 * einen Netzzugriff, die Engine prueft die Allowlist, fuehrt ihn aus und
 * stellt die Antwort als EIGENE Kaskade zu. Die Graph-Auswertung selbst bleibt
 * dabei synchron (ADR-0008 S-2).
 */
import { describe, expect, it, vi } from "vitest";
import type { DatenpunktDatei, LogikSeite } from "@fachwerk/schema";
import type { Gewerk } from "../gewerk/loader.ts";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import { LogikEngine, type KaskadenTrace } from "./engine.ts";
import type { Ausloeser, Baustein } from "./bausteine.ts";
import { loeseFaehigkeitenAuf } from "./faehigkeiten.ts";
import type { NetzAntwort, NetzAusfuehrer } from "./netz.ts";

const boolDp = (name: string) => ({ name, klasse: "intern", typ: "bool" }) as const;
const textDp = (name: string) => ({ name, klasse: "intern", typ: "text" }) as const;

/** Baustein, der bei true einen Netzzugriff anstoesst und die Antwort ausgibt. */
function melder(hosts: string[], url = "https://api.telegram.org/senden"): Baustein {
  const gesehen: Ausloeser[] = [];
  return {
    typ: "melder",
    faehigkeiten: loeseFaehigkeitenAuf(hosts.length > 0 ? { netz: { hosts } } : {}),
    rechne(eingaenge, ctx) {
      gesehen.push(ctx.ausloeser);
      if (ctx.ausloeser.art === "netz") {
        return { out: ctx.ausloeser.ok ? "ok" : `fehler: ${ctx.ausloeser.fehler ?? ctx.ausloeser.status}` };
      }
      if (eingaenge["in"] !== true) return null;
      ctx.netz.hole("a1", url, { methode: "POST", koerper: "hallo" });
      return null;
    },
  } as Baustein & { gesehen?: Ausloeser[] };
}

function aufbau(baustein: Baustein, netz?: NetzAusfuehrer) {
  const datenpunkte: Record<string, DatenpunktDatei> = {
    io: { start: boolDp("Start"), ergebnis: textDp("Ergebnis") },
  };
  const logik: Record<string, LogikSeite> = {
    s1: {
      knoten: { n1: { baustein: "melder" } },
      kanten: [
        { von: "dp:io.start", nach: "n1.in" },
        { von: "n1.out", nach: "dp:io.ergebnis" },
      ],
    },
  };
  const g: Gewerk = {
    manifest: { format: 1, name: "Netz-Test" },
    datenpunkte: new Map(Object.entries(datenpunkte)),
    logik: new Map(Object.entries(logik)),
  };
  const registry = new DatenpunktRegistry(g);
  const traces: KaskadenTrace[] = [];
  const warnungen: string[] = [];
  const engine = new LogikEngine(g, registry, {
    bausteine: (typ) => (typ === "melder" ? baustein : undefined),
    onTrace: (t) => traces.push(t),
    onWarnung: (w) => warnungen.push(w),
    now: () => 0,
    ...(netz ? { netz } : {}),
  });
  engine.start();
  return { registry, engine, traces, warnungen };
}

/** Kurz warten, bis die Antwort-Kaskade durch ist (Zustellung ist asynchron). */
const gleichDanach = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("ADR-0014 V-2: Netzzugriff nur ueber die Engine", () => {
  it("fuehrt einen erlaubten Auftrag aus und liefert die Antwort als eigene Kaskade", async () => {
    const ausfuehrer = vi.fn<NetzAusfuehrer>(async (auftrag) => ({
      id: auftrag.id,
      ok: true,
      status: 200,
      text: "{}",
    }));
    const { registry, traces } = aufbau(melder(["api.telegram.org"]), ausfuehrer);

    registry.schreibe("io.start", true, "system");
    // Synchron ist noch nichts passiert — die Kaskade wartet nicht auf das Netz.
    expect(registry.get("io.ergebnis")).toBeUndefined();
    expect(ausfuehrer).toHaveBeenCalledOnce();
    expect(ausfuehrer.mock.calls[0]![0]).toMatchObject({
      id: "a1",
      url: "https://api.telegram.org/senden",
      methode: "POST",
      koerper: "hallo",
    });
    // Die Allowlist reicht die Engine mit — der Baustein bestimmt sie nicht.
    expect(ausfuehrer.mock.calls[0]![1]).toEqual({ hosts: ["api.telegram.org"] });

    await gleichDanach();
    expect(registry.get("io.ergebnis")).toBe("ok");
    const letzte = traces.at(-1)!;
    // Knoten-Ids sind seitenqualifiziert (<seite>/<knoten>).
    expect(letzte.ausloeser).toMatchObject({ art: "netz", knoten: "s1/n1", netzId: "a1", ok: true });
  });

  it("lehnt Ziele ausserhalb der Allowlist ab, ohne den Dienst zu rufen", async () => {
    const ausfuehrer = vi.fn<NetzAusfuehrer>(async () => ({
      id: "x",
      ok: true,
      status: 200,
      text: "",
    }));
    const { registry, warnungen } = aufbau(
      melder(["api.telegram.org"], "https://boese.example/klau"),
      ausfuehrer,
    );

    registry.schreibe("io.start", true, "system");
    await gleichDanach();

    expect(ausfuehrer).not.toHaveBeenCalled();
    expect(registry.get("io.ergebnis")).toContain("Allowlist");
    expect(warnungen.join(" ")).toContain("abgelehnt");
  });

  it("ohne netz-Faehigkeit gibt es keinen Zugriff — und der Baustein erfaehrt es", async () => {
    const ausfuehrer = vi.fn<NetzAusfuehrer>(async () => ({
      id: "x",
      ok: true,
      status: 200,
      text: "",
    }));
    const { registry } = aufbau(melder([]), ausfuehrer);

    registry.schreibe("io.start", true, "system");
    await gleichDanach();

    expect(ausfuehrer).not.toHaveBeenCalled();
    // Kein stilles Verschlucken: die Absage kommt als Antwort zurueck.
    expect(registry.get("io.ergebnis")).toContain("keine netz-Faehigkeit");
  });

  it("ohne konfigurierten Netz-Dienst laeuft der Baustein nicht ins Leere", async () => {
    const { registry } = aufbau(melder(["api.telegram.org"]));
    registry.schreibe("io.start", true, "system");
    await gleichDanach();
    expect(registry.get("io.ergebnis")).toContain("kein Netz-Dienst");
  });

  it("ein scheiternder Dienst wird zur Fehler-Antwort, nicht zur Ausnahme", async () => {
    const ausfuehrer: NetzAusfuehrer = () => Promise.reject(new Error("Socket tot"));
    const { registry } = aufbau(melder(["api.telegram.org"]), ausfuehrer);
    registry.schreibe("io.start", true, "system");
    await gleichDanach();
    expect(registry.get("io.ergebnis")).toContain("Socket tot");
  });

  it("die Antwort-Kaskade traegt den Auslöser netz mit Nutzlast", async () => {
    let gesehen: Ausloeser | null = null;
    const baustein: Baustein = {
      typ: "melder",
      faehigkeiten: loeseFaehigkeitenAuf({ netz: { hosts: ["api.telegram.org"] } }),
      rechne(eingaenge, ctx) {
        if (ctx.ausloeser.art === "netz") {
          gesehen = ctx.ausloeser;
          return null;
        }
        if (eingaenge["in"] !== true) return null;
        ctx.netz.hole("abc", "https://api.telegram.org/x");
        return null;
      },
    };
    const antwort: NetzAntwort = { id: "abc", ok: false, status: 503, text: "kaputt" };
    const { registry } = aufbau(baustein, async () => antwort);
    registry.schreibe("io.start", true, "system");
    await gleichDanach();
    expect(gesehen).toEqual({ art: "netz", id: "abc", ok: false, status: 503, text: "kaputt" });
  });
});
