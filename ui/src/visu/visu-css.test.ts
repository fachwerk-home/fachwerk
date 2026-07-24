import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("./visu.css", import.meta.url), "utf8");

function regelFuer(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return CSS.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("Visu-CSS", () => {
  it("rendert Label-Presets ohne Standard-Kachel", () => {
    const regel = regelFuer(".visu-element[data-preset=\"label\"]");

    expect(regel).toContain("border-width: 0");
    expect(regel).toContain("background: transparent");
    expect(regel).toContain("box-shadow: none");
  });
});
