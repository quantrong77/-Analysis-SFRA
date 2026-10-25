/** TB 812 indices and peak finding, checked against the Python/scipy reference (key "scipy_pair1" of the expectations file). */
import { describe, expect, it } from "vitest";
import { inBand } from "../src/core/dlt911";
import { tb812Indices } from "../src/core/indices";
import { findExtrema, findPeaks, matchExtrema } from "../src/core/peaks";
import { EXPECTED, HAVE_GOLDEN, goldenSet, std } from "./helpers";

describe("chỉ số TB 812", () => {
  it("tính tay", () => {
    const r = tb812Indices([1, 2, 3, 4], [1, 2, 2, 5]);
    expect(r.CC).toBeCloseTo(31 / Math.sqrt(30 * 34), 12);
    expect(r.CCF).toBeCloseTo(1.5 / Math.sqrt(1.25 * 2.25), 12);
    expect(r.LCC).toBeCloseTo(3 / 3.5, 12);
    expect(r.ASLE).toBeCloseTo(0.5, 12);
    expect(r.SD).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect(r.CSD).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect([r.MD, r.MAXABS]).toEqual([1, 1]);
  });
});

describe("find_peaks", () => {
  it("đỉnh bằng phẳng lấy điểm giữa, prominence như scipy", () => {
    // scipy.signal.find_peaks([0,2,2,2,0,5,1,3,0], prominence=0) -> peaks [2,5,7], prominences [2,5,2]
    const r = findPeaks([0, 2, 2, 2, 0, 5, 1, 3, 0], 0);
    expect(r.map((p) => p.index)).toEqual([2, 5, 7]);
    expect(r.map((p) => p.prominence)).toEqual([2, 5, 2]);
  });
});

describe.skipIf(!HAVE_GOLDEN || !EXPECTED?.scipy_pair1)("đối chiếu scipy, cặp 1", () => {
  it("đỉnh/hố và chỉ số trùng bản Python", async () => {
    const s = await std;
    const fx = EXPECTED.scipy_pair1;
    const { pair } = await goldenSet();
    const { baseline: b, test: t } = pair(1);
    const eb = findExtrema(b.freq, b.magDb, 1.5);
    const et = findExtrema(t.freq, t.magDb, 1.5);
    const pick = (e: { kind: string; index: number; prominence: number }) => [e.kind, e.index, Number(e.prominence.toFixed(9))];
    expect(eb.map(pick)).toEqual(fx.baseline.map(pick));
    expect(et.map(pick)).toEqual(fx.test.map(pick));
    for (const [band, cfg] of Object.entries(s.dlt911.bands)) {
      const idx = b.freq.map((f, i) => (inBand(f, cfg) ? i : -1)).filter((i) => i >= 0);
      const r = tb812Indices(idx.map((i) => b.magDb[i]), idx.map((i) => t.magDb[i]));
      for (const [k, v] of Object.entries(fx.indices[band] as Record<string, number>)) expect(r[k as keyof typeof r]).toBeCloseTo(v, 10);
    }
    const m = matchExtrema(eb, et, 0.1, s);
    expect(m.filter((x) => x.ref && x.test).length).toBeGreaterThan(10);
  });
});
