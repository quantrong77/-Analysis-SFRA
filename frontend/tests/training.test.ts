/** Training: teaching ladder model, simulated failure modes, training packs and scoring. */
import { describe, expect, it } from "vitest";
import { faultInfo, TRAINING } from "../src/core/training/content";
import { simulate, type FaultId } from "../src/core/training/faults";
import { HEALTHY, logFreq, noScale, response } from "../src/core/training/ladder";
import { readPack, writePack, type TrainingCase } from "../src/core/training/pack";
import { largestShift, scoreCase } from "../src/core/training/score";
import type { PeakAnalysis } from "../src/core/peaks";

const f = logFreq();
const at = (db: number[], hz: number) => db[f.findIndex((v) => v >= hz)];
/** largest |ΔdB| between two curves inside [lo, hi] */
const maxDiff = (a: number[], b: number[], lo: number, hi: number) =>
  Math.max(...f.map((v, i) => (v >= lo && v <= hi ? Math.abs(a[i] - b[i]) : 0)));

describe("mô hình mạch hình thang (IEEE C57.149 Phụ lục A)", () => {
  const open = response(HEALTHY, noScale(HEALTHY.n), "open", f);
  const short = response(HEALTHY, noScale(HEALTHY.n), "short", f);

  it("tần số thấp là điện cảm: giảm khoảng 20 dB mỗi decade", () => {
    const slope = at(short.magDb, 2000) - at(short.magDb, 200);
    expect(slope).toBeGreaterThan(-22);
    expect(slope).toBeLessThan(-17);
  });

  it("đo ngắn mạch bỏ ảnh hưởng lõi nên biên độ vùng thấp cao hơn đo hở mạch", () => {
    expect(at(short.magDb, 50)).toBeGreaterThan(at(open.magDb, 50) + 20);
  });

  it("trên 1 MHz hai phép đo gần trùng nhau (lõi không còn ảnh hưởng)", () => {
    expect(maxDiff(open.magDb, short.magDb, 1e6, 2e6)).toBeLessThan(1);
  });

  it("có nhiều đỉnh và hố cộng hưởng trong vùng cuộn dây", () => {
    let n = 0;
    for (let i = 1; i < f.length - 1; i++) {
      if (f[i] > 5e3 && f[i] < 1e6 && open.magDb[i] > open.magDb[i - 1] && open.magDb[i] > open.magDb[i + 1]) n++;
    }
    expect(n).toBeGreaterThanOrEqual(5);
  });
});

describe("hư hỏng mô phỏng thay đổi đúng vùng tần số IEEE C57.149 mô tả", () => {
  const curve = (id: FaultId | "none", t: "open" | "short", s = 1) => {
    const x = simulate(id, s);
    return response(x.model, x.scale, t, f).magDb;
  };
  const healthy = { open: curve("none", "open"), short: curve("none", "short") };

  it("lõi thép: đổi vùng thấp khi đo hở mạch, không đổi khi đo ngắn mạch (Bảng 10)", () => {
    expect(maxDiff(curve("core", "open"), healthy.open, 20, 1e4)).toBeGreaterThan(5);
    expect(maxDiff(curve("core", "short"), healthy.short, 20, 2e6)).toBeLessThan(0.5);
  });

  it("dọc trục: vùng lõi khi đo hở mạch không đổi, 5–100 kHz đổi rõ (Bảng 8)", () => {
    expect(maxDiff(curve("axial", "open"), healthy.open, 20, 2e3)).toBeLessThan(0.5);
    expect(maxDiff(curve("axial", "open"), healthy.open, 5e3, 1e5)).toBeGreaterThan(5);
  });

  it("hướng kính: rõ ở 50 kHz – 1 MHz (Bảng 7)", () => {
    expect(maxDiff(curve("radial", "open"), healthy.open, 5e4, 1e6)).toBeGreaterThan(3);
  });

  it("chạm vòng: vùng thấp của phép đo hở mạch đổi mạnh (Bảng 12)", () => {
    expect(maxDiff(curve("turn_short", "open"), healthy.open, 20, 1e4)).toBeGreaterThan(20);
  });

  it("từ dư: chỉ dịch cộng hưởng lõi, không đổi vùng cuộn dây (6.5.9)", () => {
    expect(maxDiff(curve("residual", "open"), healthy.open, 20, 5e3)).toBeGreaterThan(3);
    expect(maxDiff(curve("residual", "open"), healthy.open, 5e4, 2e6)).toBeLessThan(0.5);
  });

  it("dây đất dài: chỉ ảnh hưởng tần số cao (IEC 60076-18 A.4)", () => {
    expect(maxDiff(curve("earth_lead", "open"), healthy.open, 20, 1e5)).toBeLessThan(0.2);
    expect(maxDiff(curve("earth_lead", "open"), healthy.open, 5e5, 2e6)).toBeGreaterThan(1);
  });

  it("mức độ 0 cho đúng đường lành", () => {
    expect(maxDiff(curve("axial", "open", 0), healthy.open, 20, 2e6)).toBe(0);
  });
});

describe("nội dung huấn luyện", () => {
  it("mỗi mục lý thuyết, cấu hình đo, hư hỏng, khuyến nghị đều có nguồn", () => {
    for (const s of TRAINING.theory) for (const i of s.items) expect(i.source.length).toBeGreaterThan(5);
    for (const s of TRAINING.setups) expect(s.source).toMatch(/IEC|IEEE/);
    for (const g of TRAINING.checklist) for (const i of g.items) expect(i.source).toMatch(/IEC|IEEE/);
    for (const x of TRAINING.faults) expect(x.source.length).toBeGreaterThan(5);
    for (const r of TRAINING.recommendations) expect(r.source.length).toBeGreaterThan(5);
  });

  it("mọi hư hỏng có trong bộ giả lập đều có mô tả, dải trả lời trỏ tới dải có thật", () => {
    const ids = new Set(TRAINING.bands.map((b) => b.id));
    for (const id of ["radial", "axial", "core", "contact", "turn_short", "open_winding", "residual", "earth_lead"]) {
      expect(faultInfo(id)?.simulated).toBe(true);
    }
    for (const x of TRAINING.faults) for (const b of x.bands) expect(ids.has(b)).toBe(true);
  });
});

const kase = (over: Partial<TrainingCase> = {}): TrainingCase => ({
  id: "c1", title: "Bài 1", transformer: "MBA thử", history: "", task: "", refId: "aaa#0", testId: "bbb#0",
  answer: { fault: "axial", bands: ["r2", "r3"], recommendation: "corroborate" }, askMeasure: true, explanation: "", ...over,
});
const pa = (refF: number, testF: number): PeakAnalysis => ({
  ref: [], test: [], fLo: 20, fHi: 2e6, prominence: 1, window: 10,
  matches: [
    { kind: "peak", ref: { freq: 1e4, db: -30, kind: "peak", prominence: 3 } as never, test: { freq: 1.01e4, db: -30, kind: "peak", prominence: 3 } as never, shiftPercent: 1, deltaHz: 100, deltaDb: 0, status: "ok", band: "LF" },
    { kind: "notch", ref: { freq: refF, db: -60, kind: "notch", prominence: 5 } as never, test: { freq: testF, db: -62, kind: "notch", prominence: 5 } as never, shiftPercent: ((testF - refF) / refF) * 100, deltaHz: testF - refF, deltaDb: -2, status: "alarm", band: "MF" },
  ],
});

describe("chấm điểm bài tập", () => {
  it("cộng hưởng dịch nhiều nhất là cặp có |dịch %| lớn nhất", () => {
    expect(largestShift(pa(2e5, 2.3e5))?.ref?.freq).toBe(2e5);
  });

  it("đúng hết được 100 %; đúng một phần dải tần được điểm theo tỉ lệ", () => {
    const full = scoreCase(kase(), { fault: "axial", bands: ["r2", "r3"], recommendation: "corroborate", measureHz: 2.29e5 }, pa(2e5, 2.3e5), {});
    expect(full.percent).toBe(100);
    const part = scoreCase(kase(), { fault: "radial", bands: ["r3"], recommendation: "corroborate", measureHz: 1e6 }, pa(2e5, 2.3e5), {});
    expect(part.fault.points).toBe(0);
    expect(part.bands.points).toBe(10);
    expect(part.measure?.points).toBe(0);
    expect(part.percent).toBe(30);
  });

  it("bài không hỏi đo đạc thì tính trên các câu còn lại", () => {
    const s = scoreCase(kase({ askMeasure: false }), { fault: "axial", bands: ["r2", "r3"], recommendation: "inspect", measureHz: null }, null, {});
    expect(s.measure).toBeNull();
    expect(s.max).toBe(80);
    expect(s.percent).toBe(75);
  });
});

describe("gói bài tập", () => {
  it("lưu rồi mở lại giữ nguyên bài, đáp án và file đo; bỏ file không dùng", async () => {
    const bytes = (s: string) => new TextEncoder().encode(s);
    const blob = await writePack({
      title: "Gói thử", author: "GV", createdAt: "2026-10-28T00:00:00Z", cases: [kase()],
      files: [{ sha256: "aaa", name: "a.csv", bytes: bytes("1") }, { sha256: "bbb", name: "b.csv", bytes: bytes("2") }, { sha256: "zzz", name: "z.csv", bytes: bytes("3") }],
    });
    const back = await readPack(new Uint8Array(await blob.arrayBuffer()));
    expect(back.title).toBe("Gói thử");
    expect(back.cases[0].answer).toEqual({ fault: "axial", bands: ["r2", "r3"], recommendation: "corroborate" });
    expect(back.files.map((x) => x.sha256).sort()).toEqual(["aaa", "bbb"]);
    expect(new TextDecoder().decode(back.files.find((x) => x.sha256 === "bbb")!.bytes)).toBe("2");
  });

  it("file không phải gói bài tập thì báo rõ", async () => {
    const JSZip = (await import("jszip")).default;
    const z = new JSZip();
    z.file("x.txt", "x");
    await expect(readPack(await z.generateAsync({ type: "uint8array" }))).rejects.toThrow(/gói bài tập/);
  });
});

describe("đối chiếu số liệu với các dạng hư hỏng IEEE C57.149 6.5", async () => {
  const { analyzePair } = await import("../src/core/analysis");
  const { interpret, likely } = await import("../src/core/training/interpret");
  const { synthTrace } = await import("../src/core/training/synth");
  const { std } = await import("./helpers");
  const s = await std;
  const pair = (id: FaultId | "none", t: "open" | "short", sev = 1) => {
    const h = simulate("none", 0);
    const x = simulate(id, sev);
    const a = synthTrace("a", "A", f, response(h.model, h.scale, t, f).magDb, response(h.model, h.scale, t, f).phaseDeg);
    const bb = response(x.model, x.scale, t, f);
    const b = synthTrace("b", "B", f, bb.magDb, bb.phaseDeg);
    if (t === "short") a.setting.measurementType = b.setting.measurementType = "Short circuit";
    return interpret(analyzePair(a, b, s), s);
  };
  const top = (id: FaultId | "none", t: "open" | "short", n: number) => likely(pair(id, t), n).map((c) => c.fault.id);

  it("hai đường như nhau: chỉ gợi ý không có thay đổi, mọi vùng không đổi", () => {
    const it = pair("none", "open");
    expect(it.regions.every((r) => r.state === "unchanged")).toBe(true);
    expect(top("none", "open", 3)).toEqual(["none"]);
  });

  it("nhận đúng loại phép đo hở mạch / ngắn mạch", () => {
    expect(pair("none", "open").test).toBe("open");
    expect(pair("none", "short").test).toBe("short");
  });

  it("dạng hư hỏng mô phỏng nằm trong các gợi ý đầu", () => {
    expect(top("axial", "open", 2)).toContain("axial");
    expect(top("radial", "open", 2)).toContain("radial");
    expect(top("residual", "open", 3)).toContain("residual");
    expect(top("turn_short", "open", 1)).toEqual(["turn_short"]);
    expect(top("open_winding", "short", 1)).toEqual(["open_winding"]);
    expect(top("contact", "short", 2)).toContain("contact");
  });

  it("không gợi ý một dạng khi không có thay đổi nào khớp với bảng", () => {
    expect(top("none", "short", 5)).not.toContain("contact");
    expect(top("none", "open", 5)).not.toContain("core");
  });

  it("mỗi gợi ý nêu lý do khớp và nguồn bảng", () => {
    const c = likely(pair("axial", "open"), 1)[0];
    expect(c.agree.length).toBeGreaterThan(0);
    expect(c.fault.source).toMatch(/IEEE Std C57\.149-2012, 6\.5/);
  });

  it("phép đo giữa các cuộn dây không đối chiếu; chỉ vùng lõi thay đổi thì nhắc loại trừ từ dư", () => {
    const h = simulate("none", 0);
    const hr = response(h.model, h.scale, "open", f);
    const a = synthTrace("a", "A-a", f, hr.magDb, hr.phaseDeg);
    const it = interpret(analyzePair(a, synthTrace("b", "A-a", f, hr.magDb.map((v) => v + 5), hr.phaseDeg), s), s);
    expect(it.skipped).toMatch(/hở mạch và ngắn mạch/);
    expect(it.candidates).toEqual([]);
    expect(pair("residual", "open").coreOnly).toBe(true);
    expect(pair("axial", "open").coreOnly).toBe(false);
  });
});
