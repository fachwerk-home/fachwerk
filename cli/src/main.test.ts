import { describe, expect, it } from "vitest";
import { SUPPORTED_GEWERK_FORMAT } from "@fachwerk/core";
import { GEWERK_FORMAT_VERSION } from "@fachwerk/schema";
import { DRIVER_ID } from "@fachwerk/driver-knx";
import { CLI_VERSION } from "./index.ts";

/** Smoke: Workspace-Verdrahtung über alle Paketgrenzen (S-1). */
describe("workspace wiring", () => {
  it("resolves cross-package imports", () => {
    expect(SUPPORTED_GEWERK_FORMAT).toBe(GEWERK_FORMAT_VERSION);
    expect(DRIVER_ID).toBe("knx");
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
