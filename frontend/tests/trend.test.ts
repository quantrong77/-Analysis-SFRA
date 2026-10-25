/**
 * Trend (spec 6.6) and browser storage. A third session is SYNTHESISED here from the 2026 data
 * (test-only; never written to the data folder): unchanged copy, or MF/HF shifted in frequency.
 */
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { interpLog } from "../src/core/resample";
import { dayKey } from "../src/core/pairing";
import { computeTrend } from "../src/core/trend";
import type { Trace } from "../src/core/types";
import { makeBackup, readBackup } from "../src/storage/backup";
import { emptyWorkspace, SfraStore } from "../src/storage/db";
import { EXPECTED, HAVE_GOLDEN, goldenSet, std } from "./helpers";

// synthetic session one year after the newest real one
const plusYear = (d: Date) => new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), 10, 0, 0);

/** Copy of a trace dated one year later; above fShift the curve is read at f·(1+shift) (resonances move). */
function synth(t: Trace, shift: number, fShift = 1e5): Trace {
  const d = plusYear(t.testDate!);
  const f = t.freq;
  const moved = f.map((v) => Math.min(v * (1 + shift), f[f.length - 1]));
  const shifted = interpLog(f, t.magDb, moved);
  return {
    ...t, id: `${t.id}-synth`, testDate: d, sourceName: `synth_${t.sourceName}`,
    magDb: t.magDb.map((v, i) => (f[i] > fShift ? shifted[i] : v)),
  };
}

describe.skipIf(!HAVE_GOLDEN)("xu hướng", () => {
  it("2 kỳ đo → chưa đủ dữ liệu; Rxy so với baseline", async () => {
    const s = await std;
    const { traces, baselineSession } = await goldenSet();
    const tr = computeTrend(traces, baselineSession, s);
    expect(tr.mode).toBe("A");
    expect(tr.series).toHaveLength(18);
    expect(tr.series.every((x) => x.status.id === "insufficient")).toBe(true);
    expect(tr.series[0].points[0].result!.bands.LF.rxy).toBeCloseTo(EXPECTED.golden.rxy["1"][0], 4);
    expect(tr.series[0].status.messages[0]).toBe("Mới có 2 kỳ đo (cần ít nhất 3 kỳ, kể cả baseline).");
  });

  it("kỳ thứ 3 không đổi → ổn định; kỳ thứ 3 dịch cộng hưởng → cảnh báo", async () => {
    const s = await std;
    const { traces, baselineSession, testSession, pair } = await goldenSet();
    const newest = traces.filter((t) => dayKey(t.testDate) === testSession);
    const changed = new Set([pair(1).test.id, pair(16).test.id]);
    const third = newest.map((t) => synth(t, changed.has(t.id) ? 0.03 : 0));
    const tr = computeTrend([...traces, ...third], baselineSession, s);
    const synthSession = dayKey(third[0].testDate);
    expect(tr.sessions).toEqual([baselineSession, testSession, synthSession]);
    expect(tr.mode).toBe("A");

    const warn = tr.series.filter((x) => x.status.id === "warning").map((x) => x.index);
    expect(warn).toEqual([1, 16]);
    const s1 = tr.series.find((x) => x.index === 1)!;
    // Rxy of every point is against the baseline
    expect(s1.points.map((p) => p.session)).toEqual([testSession, synthSession]);
    expect(s1.points[0].result!.bands.MF.rxy).toBeCloseTo(EXPECTED.golden.rxy["1"][1], 4);
    // the warning names a band whose Rxy fell by more than 20 % from the first session with Rxy
    const dropped = ["MF", "HF"].filter(
      (b) => s1.points[1].result!.bands[b].rxy! < 0.8 * s1.points[0].result!.bands[b].rxy!,
    );
    expect(dropped.length).toBeGreaterThan(0);
    const [y, m, d] = testSession.split("-");
    for (const b of dropped) {
      expect(s1.status.messages.some((x) => x.startsWith(`R${b} giảm`) && x.includes(`so với kỳ ${d}/${m}/${y}`))).toBe(true);
    }
    const s2 = tr.series.find((x) => x.index === 2)!;
    expect(s2.status.id).toBe("stable");
    expect(s2.points[1].result!.bands.MF.rxy).toBeCloseTo(s2.points[0].result!.bands.MF.rxy!, 10);
  });

  it("lưới khác nhau giữa các kỳ → dùng chung chế độ B", async () => {
    const s = await std;
    const { traces, baselineSession, pair } = await goldenSet();
    const t = pair(2).test;
    const coarse = { ...synth(t, 0), freq: t.freq.filter((_, i) => i % 2 === 0), magDb: t.magDb.filter((_, i) => i % 2 === 0), phaseDeg: t.phaseDeg.filter((_, i) => i % 2 === 0) };
    const tr = computeTrend([...traces, coarse], baselineSession, s);
    expect(tr.mode).toBe("B");
    const s2 = tr.series.find((x) => x.index === 2)!;
    expect(s2.points.every((p) => p.result?.aligned.mode === "B")).toBe(true);
  });
});

describe("lưu trữ trình duyệt và sao lưu", () => {
  it("lưu file gốc, sửa đổi, sao lưu .zip và khôi phục", async () => {
    const store = await SfraStore.open();
    const bytes = new TextEncoder().encode("[FRA Data v2.0],,,\n");
    await store.putFiles([{ sha256: "abc", name: "1_A-a_2020-01-02_03-04-05.csv", bytes, size: bytes.length, addedAt: "2026-10-25T00:00:00Z" }]);
    const ws = { ...emptyWorkspace(), dateEdits: { "abc#0": "2026-05-27T00:00:00.000Z" }, mode: "C" as const };
    await store.saveWorkspace(ws);
    const files = await store.listFiles();
    expect(files).toHaveLength(1);
    expect(Array.from(files[0].bytes)).toEqual(Array.from(bytes));
    expect(await store.loadWorkspace()).toEqual(ws);

    const zip = await makeBackup(files, ws, "1.0.0+test");
    const restored = await readBackup(new Uint8Array(await zip.arrayBuffer()));
    expect(restored.files[0].sha256).toBe("abc");
    expect(Array.from(restored.files[0].bytes)).toEqual(Array.from(bytes));
    expect(restored.workspace).toEqual(ws);

    await store.clear();
    expect(await store.listFiles()).toHaveLength(0);
    expect(await store.loadWorkspace()).toEqual(emptyWorkspace());
    store.close();
  });
});
