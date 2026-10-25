/** Reference comparison between phases / sister units (spec 6.7). */
import { describe, expect, it } from "vitest";
import { compareTraces, phaseGroups, phasePairs, phasePattern } from "../src/core/compare";
import { EXPECTED, HAVE_GOLDEN, goldenSet, std } from "./helpers";

describe("so sánh tham khảo", () => {
  it("nhận dạng pha từ ký hiệu", () => {
    expect(phasePattern("B-b")).toEqual({ pattern: "P-p", phase: "B" });
    expect(phasePattern("c-N")).toEqual({ pattern: "p-N", phase: "C" });
    expect(phasePattern("Y2-Y3")).toEqual({ pattern: "Yi-Yj", phase: "Y2-Y3" });
    expect(phasePattern("HA-MA")).toBeNull();
  });

  it.skipIf(!HAVE_GOLDEN)("nhóm pha mỗi kỳ, cùng ký hiệu khác cấu hình tách riêng; chỉ số, không phân loại", async () => {
    const s = await std;
    const { traces, testSession } = await goldenSet();
    const groups = phaseGroups(traces, s).filter((g) => g.session === testSession);
    expect(groups.map((g) => g.members.map((m) => m.trace.index))).toEqual(EXPECTED.golden.phase_groups);
    expect(phasePairs(groups[0])).toHaveLength(3);
    const [a, b] = phasePairs(groups[0])[0];
    const c = compareTraces(a, b, s);
    expect(c.bands.map((x) => x.key)).toEqual(["LF", "MF", "HF"]);
    expect(c.bands.every((x) => x.rxy !== null && x.tb812.CCF !== null)).toBe(true);
    expect("classification" in c).toBe(false);
    // same trace -> perfect agreement
    const self = compareTraces(a, a, s);
    expect(self.bands.every((x) => x.rxy === 10 && x.tb812.SD === 0)).toBe(true);
  });
});
