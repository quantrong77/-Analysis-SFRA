import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classify, relativeFactor } from "../src/core/dlt911";
import { parseFile } from "../src/core/parsers";
import { interpPhase, logGrid, wrapDeg } from "../src/core/resample";
import type { Trace } from "../src/core/types";
import { DATA_DIR, EXPECTED, VENDOR_DIR, parseText, std } from "./helpers";

describe("DL/T 911 Bảng A.1", () => {
  const cases: [number, number, number, string][] = [
    [0.3, 2, 2, "severe"], [0.599, 0.1, 0.1, "severe"],
    [0.6, 2, 2, "obvious"], [0.99, 2, 2, "obvious"], [2.5, 0.5, 2, "obvious"], [1.5, 0.59, 2, "obvious"],
    [1.0, 2, 2, "slight"], [1.99, 2, 2, "slight"], [2.5, 0.6, 2, "slight"], [2.5, 0.99, 2, "slight"],
    [2.0, 1.0, 0.6, "normal"], [2.7227, 2.6717, 1.4528, "normal"],
    [2.5, 1.5, 0.59, "review"], [2.0, 1.0, 0, "review"],
  ];
  it.each(cases)("RLF=%s RMF=%s RHF=%s → %s", async (lf, mf, hf, id) => {
    expect(classify({ LF: lf, MF: mf, HF: hf }, await std).id).toBe(id);
  });
  it("thiếu dải → không đủ dữ liệu", async () => {
    expect(classify({ LF: 3, MF: null, HF: 1 }, await std).id).toBe("insufficient");
  });
  it("công thức tính tay", () => {
    const r = relativeFactor([1, 2, 3, 4], [1, 2, 2, 5]);
    expect([r.xMean, r.yMean, r.dx, r.dy, r.cxy]).toEqual([2.5, 2.5, 1.25, 2.25, 1.5]);
    expect(r.rxy).toBeCloseTo(-Math.log10(1 - 1.5 / Math.sqrt(1.25 * 2.25)), 12);
  });
});

describe("căn lưới", () => {
  it("wrap và unwrap góc pha", () => {
    expect([180, -180, 190, -190, 0].map(wrapDeg)).toEqual([180, 180, -170, 170, 0]);
    expect(interpPhase([1, 10], [170, -170], [Math.sqrt(10)])[0]).toBeCloseTo(180, 9);
  });
  it("lưới log neo theo decade", () => {
    const f = logGrid(20, 2e6, 200);
    expect(f.filter((v) => v >= 1e3 && v < 1e4)).toHaveLength(200);
  });
});

const SAMPLE = `[FRA Data v2.0],,,
temp,NaN,RH,NaN
A-a_2026 freq,A-a_2026 RMS,A-a_2026 Peaks,A-a_2026 Phase
20.5,-30.1,-30.0,-80.0
1000,-35.2,-35.1,-60.5
1000,-99,-99,-99
500000,-40.0,-40.0,10.25
,,,

[nameplate OutPutFileName.csv]
Location,TRAM MAU
Serial Number,SN-0001
Notes,ghi chu nameplate
[nameplate end]
[apparatusLocation  version="1"]
location,TRAM MAU
notes,GHI CHU MAU
[testSetup version="2"]
timestamp,02/01/2020 03:04:05
notes,
[testSetting version="1"]
redLead,Y2
blackLead,Y1
measurementType,OpenCircuit
`;

describe("parser FRA v2.0", () => {
  const check = async (text: string) => {
    const [t] = await parseText(text, "1_A-a_2020-01-02_03-04-05.csv");
    expect(t.freq).toEqual([20.5, 1000, 500000]);
    expect(t.magDb).toEqual([-30.1, -35.2, -40]);
    expect(t.phaseDeg).toEqual([-80, -60.5, 10.25]);
    expect(t.serialNumber).toBe("SN-0001");
    expect(t.index).toBe(1);
    expect(t.label).toBe("A-a");
    expect(t.setting.redLead).toBe("Y2");
    const notes = t.sections.filter((s) => "notes" in s.items || "Notes" in s.items).map((s) => s.items.notes ?? s.items.Notes);
    expect(notes).toEqual(["ghi chu nameplate", "GHI CHU MAU", ""]);
  };
  it("dấu phẩy, dòng trống, metadata cuối file", () => check(SAMPLE));
  it("dấu ; và thập phân ,", () =>
    check(
      SAMPLE.split("\n").map((l) => l.split(",").join(";")).join("\n")
        .replace("20.5;-30.1;-30.0;-80.0", "20,5;-30,1;-30,0;-80,0")
        .replace("-35.2;-35.1;-60.5", "-35,2;-35,1;-60,5")
        .replace("-40.0;-40.0;10.25", "-40,0;-40,0;10,25"),
    ));
});

const nostt = (() => {
  try {
    return EXPECTED ? readdirSync(DATA_DIR).filter((f) => f.includes(EXPECTED.nostt.file_contains) && f.endsWith(".csv")) : [];
  } catch {
    return [];
  }
})();

describe.skipIf(nostt.length === 0)("ghép cặp file không có STT", () => {
  it("cùng ký hiệu nhưng khác cấu hình nối tắt là hai phép đo khác nhau; một kỳ đo thì không tự ghép", async () => {
    const s = await std;
    const traces = [];
    for (const f of nostt) traces.push(...(await parseFile(new Uint8Array(readFileSync(join(DATA_DIR, f))), f, s)));
    const { groupTraces } = await import("../src/core/pairing");
    const groups = groupTraces(traces);
    for (const g of groups) {
      const n = traces.filter((t) => t.transformerKey === g.key).length;
      expect(g.rows).toHaveLength(n);
      expect(g.rows.every((r) => r.testId === null)).toBe(true);
    }
    const g = groups.find((x) => x.key === EXPECTED.nostt.group)!;
    expect(g.rows.map((r) => r.label).sort()).toEqual(EXPECTED.nostt.labels);
  });
});

describe.skipIf(!VENDOR_DIR || !EXPECTED)("file hãng (file_vendor)", () => {
  it("đọc được Doble .sfra và Megger .frax; FRAX khớp giá trị đối chiếu với phần mềm FRAX", async () => {
    const s = await std;
    const v = EXPECTED.vendor;
    const all: Trace[] = [];
    for (const f of readdirSync(VENDOR_DIR!)) all.push(...(await parseFile(new Uint8Array(readFileSync(join(VENDOR_DIR!, f))), f, s)));
    for (const t of all) expect(t.magDb.every(Number.isFinite)).toBe(true);
    const frax = all.filter((t) => t.formatId === "frax");
    expect(frax.map((t) => t.label)).toEqual(v.frax_labels);
    expect(frax.every((t) => t.freq.length === v.frax_points && t.transformerKey === v.frax_tx)).toBe(true);
    const chk = frax.find((t) => t.label === v.frax_check.sweep)!;
    const lf = Math.log10(v.frax_check.freq);
    const i = chk.freq.reduce((b, f, k) => (Math.abs(Math.log10(f) - lf) < Math.abs(Math.log10(chk.freq[b]) - lf) ? k : b), 0);
    expect(chk.magDb[i]).toBeCloseTo(v.frax_check.db, 2);
    expect(chk.phaseDeg[i]).toBeCloseTo(v.frax_check.deg, 1);
    expect(chk.parseNotes).toEqual([]); // magnitude and phase confirmed -> no warning note
    const doble = all.filter((t) => t.formatId === "doble_sfra");
    expect(doble).toHaveLength(1);
    expect(doble[0].label).toBe(v.doble_label);
    expect(doble[0].transformerKey).toBe(v.doble_tx);
  });
});
