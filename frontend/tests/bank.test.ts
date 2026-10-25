/** Pairing keys across vendor formats and phase comparison of single-phase banks (synthetic traces). */
import { describe, expect, it } from "vitest";
import { bankTraces, phaseGroups, phasePattern } from "../src/core/compare";
import { groupTraces, pairKey } from "../src/core/pairing";
import { emptySetting, type Trace } from "../src/core/types";
import { std } from "./helpers";

let n = 0;
function trace(tx: string, label: string, date: Date, setting: Partial<Trace["setting"]> = {}, sourceName = `${label}.csv`): Trace {
  const freq = Array.from({ length: 50 }, (_, i) => 20 * 10 ** (i / 7));
  return {
    id: `t${n++}`, freq, magDb: freq.map((f) => -20 - Math.log10(f)), phaseDeg: freq.map(() => -80), peaksDb: null,
    traceName: label, sourceName, sha256: `s${n}`, formatId: "x", formatLabel: "x", sections: [],
    setting: { ...emptySetting(), ...setting }, serialNumber: tx, location: "Trạm X", transformerKey: tx,
    testDate: date, dateSource: "", encoding: "utf-8", index: null, label, parseNotes: [],
  };
}

const D1 = new Date(2024, 0, 10, 9);
const D2 = new Date(2025, 0, 10, 9);

describe("khoá ghép cặp file không có STT", () => {
  it("Doble ghi measurementType dạng số: vẫn ghép với CSV cùng phép đo", () => {
    const sfra = trace("SN-A", "a-A", D1, { measurementType: "0", shortedTerminal: "none" }, "x_a-A.sfra");
    const csv = trace("SN-A", "a-A", D2, { measurementType: "OpenCircuit", shortedTerminal: "none" });
    expect(pairKey(sfra)).toBe(pairKey(csv));
    const [g] = groupTraces([sfra, csv]);
    expect(g.sessions).toHaveLength(2);
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0].baselineId).toBe(sfra.id);
    expect(g.rows[0].testId).toBe(csv.id);
  });

  it("hở mạch và nối tắt cùng ký hiệu vẫn tách riêng", () => {
    const open = trace("SN-A", "a-N", D1, { measurementType: "OpenCircuit", shortedTerminal: "none" });
    const short = trace("SN-A", "a-N", D1, { measurementType: "ShortCircuit", shortedTerminal: "Y1-Y2" });
    const byName = trace("SN-A", "a-N", D1, { measurementType: "0" }, "x_a-N_short_Y12.sfra");
    expect(new Set([pairKey(open), pairKey(short), pairKey(byName)]).size).toBe(3);
  });
});

describe("tổ máy một pha", () => {
  it("nhận dạng pha trong ký hiệu cuộn thứ ba", () => {
    expect(phasePattern("Y1_A-Y2_A")).toEqual({ pattern: "Y1p-Y2p", phase: "A" });
    expect(phasePattern("Y1-B-Y2-B")).toEqual({ pattern: "Y1p-Y2p", phase: "B" });
    expect(phasePattern("Y1-B-Y2-C")).toBeNull();
  });

  it("so sánh giữa các máy một pha cùng vị trí, cùng ngày", async () => {
    const s = await std;
    const all = (["A", "B", "C"] as const).flatMap((p) => [
      trace(`SN-${p}`, `${p.toLowerCase()}-${p}`, D2, { measurementType: "OpenCircuit", shortedTerminal: "none" }),
      trace(`SN-${p}`, `${p.toLowerCase()}-N`, D2, { measurementType: "ShortCircuit", shortedTerminal: p === "A" ? "Y1-Y2" : `Y1${p}-Y2${p}` }),
      trace(`SN-${p}`, p === "A" ? "Y1_A-Y2_A" : `Y1-${p}-Y2-${p}`, D2, { measurementType: "OpenCircuit", shortedTerminal: "none" }),
    ]);
    const bank = bankTraces(all, "SN-B");
    expect(bank.units).toEqual(["SN-B", "SN-A", "SN-C"]);
    const groups = phaseGroups(bank.traces, s);
    const found = groups.map((g) => `${g.pattern} ${g.members.map((m) => m.phase).join("")}`).sort();
    expect(found).toEqual(["Y1p-Y2p ABC", "p-N ABC", "p-P ABC"]);
  });

  it("máy ba pha không gộp với máy khác", () => {
    const three = (["A", "B", "C"] as const).map((p) => trace("SN-3P", `${p}-N`, D2));
    const other = trace("SN-1P", "a-A", D2);
    expect(bankTraces([...three, other], "SN-3P").units).toEqual(["SN-3P"]);
  });
});
