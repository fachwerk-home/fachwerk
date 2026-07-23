import { describe, expect, it } from "vitest";
import { ApiFehler, type IchAntwort } from "./api.ts";
import { authFehlerText, hatScope } from "./auth.ts";

const ICH: IchAntwort = { name: "anna", art: "sitzung", scopes: ["read", "operate"] };

describe("Auth-Helfer", () => {
  it("spiegelt Scopes explizit", () => {
    expect(hatScope(ICH, "read")).toBe(true);
    expect(hatScope(ICH, "operate")).toBe(true);
    expect(hatScope(ICH, "write:gewerk")).toBe(false);
    expect(hatScope(null, "read")).toBe(false);
  });

  it("nennt 401 bewusst generisch und 429 mit Rate-Limit-Hinweis", () => {
    expect(authFehlerText(new ApiFehler(401, "Unauthorized", "/api/login", { fehler: "Anmeldung fehlgeschlagen" })))
      .toBe("Anmeldung fehlgeschlagen");
    expect(authFehlerText(new ApiFehler(429, "Too Many Requests", "/api/login", { fehler: "zu viele Anmeldeversuche" })))
      .toContain("zu viele Anmeldeversuche");
  });
});

