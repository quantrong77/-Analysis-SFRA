/** Golden test (spec 9). Expected values come from the file outside the repository (helpers.ts). */
import { describe, expect, it } from "vitest";
import { analyzePair } from "../src/core/analysis";
import { groupTraces } from "../src/core/pairing";
import { transformerConclusion } from "../src/core/rules";
import type { Trace } from "../src/core/types";
import { EXPECTED, HAVE_GOLDEN, SFRA_DIR, goldenSet, std } from "./helpers";

async function pairsOf(traces: Trace[]) {
  const s = await std;
  const groups = groupTraces(traces);
  expect(groups).toHaveLength(1);
  const byId = new Map(traces.map((t) => [t.id, t]));
  return groups[0].rows.map((r) => analyzePair(byId.get(r.baselineId!)!, byId.get(r.testId!)!, s, { mode: "A" }));
}

function checkRxy(results: Awaited<ReturnType<typeof pairsOf>>) {
  const rxy = EXPECTED.golden.rxy as Record<string, [number, number, number]>;
  expect(results.map((r) => r.index)).toEqual(Object.keys(rxy).map(Number).sort((a, b) => a - b));
  for (const r of results) {
    const [lf, mf, hf] = rxy[String(r.index)];
    expect(Math.abs(r.bands.LF.rxy! - lf)).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(r.bands.MF.rxy! - mf)).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(r.bands.HF.rxy! - hf)).toBeLessThanOrEqual(1e-4);
  }
}

describe.skipIf(!HAVE_GOLDEN)("golden (CSV FRA v2.0)", () => {
  it("Rxy khớp Excel v6 ≤ 1e-4, toàn bộ Bình thường, cảnh báo đảo đầu đo, câu kết luận", async () => {
    const g = EXPECTED.golden;
    const { traces } = await goldenSet();
    for (const t of traces) {
      expect(t.freq.length).toBe(g.points);
      expect(t.serialNumber).toBe(g.serial);
    }
    const results = await pairsOf(traces);
    checkRxy(results);
    for (const r of results) {
      expect(r.classification.id).toBe("normal");
      expect([r.bands.LF.n, r.bands.MF.n, r.bands.HF.n]).toEqual(g.band_counts);
    }
    const flagged = results
      .filter((r) => r.warnings.some((w) => w.code !== "dlt911_step"))
      .map((r) => [r.index, r.warnings.filter((w) => w.code !== "dlt911_step").map((w) => w.code)]);
    expect(flagged).toEqual((g.reversed_leads as number[]).map((i) => [i, ["reversed_leads"]]));
    expect(transformerConclusion(results, await std).text).toBe(g.conclusion_text);
  });

  it("căn lưới: bỏ 1 trong 2 điểm → giá trị đặc tả mục 9, lệch < 5 %; chế độ C", async () => {
    const s = await std;
    const g = EXPECTED.golden;
    const { pair } = await goldenSet();
    const { baseline: base, test } = pair(1);
    const dec: Trace = {
      ...test,
      freq: test.freq.filter((_, i) => i % 2 === 0),
      magDb: test.magDb.filter((_, i) => i % 2 === 0),
      phaseDeg: test.phaseDeg.filter((_, i) => i % 2 === 0),
    };
    const a = analyzePair(base, test, s, { mode: "A" });
    const b = analyzePair(base, dec, s);
    expect(b.aligned.mode).toBe("B");
    ["LF", "MF", "HF"].forEach((k, i) => {
      expect(b.bands[k].rxy!).toBeCloseTo(g.decimated_pair1[i], 3);
      expect(Math.abs(b.bands[k].rxy! - a.bands[k].rxy!) / a.bands[k].rxy!).toBeLessThan(0.05);
    });
    const c = analyzePair(base, test, s, { mode: "C" });
    expect(c.bands.LF.rxy!).toBeCloseTo(g.logc_pair1_lf, 3); // same as Python reference
    expect(c.classification.id).toBe("normal");
  });

  it("so một file với chính nó → Rxy = 10", async () => {
    const { traces } = await goldenSet();
    const r = analyzePair(traces[0], traces[0], await std);
    expect(Object.values(r.bands).map((b) => b.rxy)).toEqual([10, 10, 10]);
  });
});

describe.skipIf(!HAVE_GOLDEN || !SFRA_DIR)("golden dạng Doble .sfra", () => {
  it("cùng Rxy với file CSV", async () => {
    const { traces } = await goldenSet(".sfra");
    checkRxy(await pairsOf(traces));
  });
});
