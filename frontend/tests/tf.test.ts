import { describe, expect, it } from "vitest";
import { fromU, phaseText, readAt, rlCorner, sweep, toU, turningPoints } from "../src/core/training/tf";

describe("transfer-function lab", () => {
  const rl = sweep("rl");

  it("R–L example follows the first-order response", () => {
    const flat = 20 * Math.log10(50 / 55);
    const low = readAt(rl, 20);
    expect(low.magDb).toBeCloseTo(flat, 1);
    const fc = readAt(rl, rlCorner());
    expect(fc.phaseDeg).toBeGreaterThan(-48);
    expect(fc.phaseDeg).toBeLessThan(-42);
    expect(fc.magDb - flat).toBeCloseTo(-3, 0);
    const high = readAt(rl, 1e5);
    expect(high.slope).toBeCloseTo(-20, 0);
    expect(high.phaseDeg).toBeLessThan(-85);
  });

  it("delay is positive when V_out lags and matches φ / 360 of a period", () => {
    const x = readAt(rl, 2000);
    expect(x.phaseDeg).toBeLessThan(0);
    expect(x.delay).toBeGreaterThan(0);
    expect(x.delay).toBeCloseTo(-x.phaseDeg / 360 / x.f, 12);
    expect(x.ratio).toBeCloseTo(10 ** (x.magDb / 20), 10);
  });

  it("R–L has no resonance; the winding model has notches and peaks", () => {
    expect(turningPoints(rl)).toHaveLength(0);
    const open = turningPoints(sweep("open"));
    expect(open.some((t) => t.kind === "min")).toBe(true);
    expect(open.some((t) => t.kind === "max")).toBe(true);
    const t = open[0];
    expect(readAt(sweep("open"), t.f).extremum?.f).toBe(t.f);
  });

  it("log axis position round-trips", () => {
    for (const f of [20, 1e3, 123456, 2e6]) expect(fromU(toU(f))).toBeCloseTo(f, 6);
  });

  it("phase text: lag inductive, lead capacitive, near zero resistive", () => {
    expect(phaseText(-60).tone).toBe("lag");
    expect(phaseText(60).tone).toBe("lead");
    expect(phaseText(5).tone).toBe("flat");
  });
});
