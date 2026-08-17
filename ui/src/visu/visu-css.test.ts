import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("./visu.css", import.meta.url), "utf8");

function regelFuer(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return CSS.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("Visu-CSS", () => {
  it("rendert Label-Presets ohne Standard-Kachel", () => {
    const regel = regelFuer(".visu-element[data-kachel=\"false\"]");

    expect(regel).toContain("border-width: 0");
    expect(regel).toContain("background: transparent");
    expect(regel).toContain("box-shadow: none");
  });

  it("rendert Visu-Elemente standardmäßig linksbündig", () => {
    const regel = regelFuer(".visu-element");

    expect(regel).toContain("justify-content: flex-start");
    expect(regel).toContain("text-align: left");
  });

  it("lässt einzelne Symbol-Glyphen über ihre Box hinausragen", () => {
    const regel = regelFuer(".visu-element[data-einzelsymbol=\"true\"]");

    expect(regel).toContain("overflow: visible");
  });

  it("legt den Schiebeschalterknopf über seine Rahmenbeschriftung", () => {
    const regel = regelFuer(".schiebeschalter-knopf");

    expect(regel).toContain("z-index: 2");
  });
});
