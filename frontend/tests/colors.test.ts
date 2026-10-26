/** Curve colours chosen by the user: per trace, used by the figures, carried by group packages. */
import { describe, expect, it } from "vitest";
import { BASELINE_COLOR, bodeFigure, curveColor, peakMarkers, TEST_COLOR } from "../src/charts/figures";
import { emptyWorkspace } from "../src/storage/db";
import { workspaceFor, workspaceWithout } from "../src/storage/backup";
import { emptySetting, type Trace } from "../src/core/types";
import { std } from "./helpers";

const trace = (id: string): Trace => ({
  id, freq: [10, 100, 1000], magDb: [0, -1, -2], phaseDeg: [0, 10, 20], peaksDb: null, traceName: id, sourceName: `${id}.csv`,
  sha256: id.split("#")[0], formatId: "x", formatLabel: "x", sections: [], setting: emptySetting(), serialNumber: "SN", location: "",
  transformerKey: "SN", testDate: new Date(2024, 0, 1), dateSource: "", encoding: "utf-8", index: 1, label: "A-a", parseNotes: [],
});

describe("màu đường đo", () => {
  it("mặc định theo vai trò, màu người dùng chọn thay cho đúng đường đó", () => {
    const a = trace("f1#0");
    expect(curveColor(a, "baseline")).toBe(BASELINE_COLOR);
    expect(curveColor(a, "test")).toBe(TEST_COLOR);
    expect(curveColor(a, "test", { "f1#0": "#000000" })).toBe("#000000");
    expect(curveColor(a, "baseline", { "f2#0": "#000000" })).toBe(BASELINE_COLOR);
  });

  it("giản đồ và ký hiệu đỉnh/hố dùng màu đã chọn", async () => {
    const b = trace("f1#0");
    const t = trace("f2#0");
    const fig = bodeFigure({ baseline: b, test: t }, await std, [], undefined, [], { colors: { "f2#0": "#123456" } });
    const lines = fig.data.map((d) => (d.line as { color: string }).color);
    expect(lines).toEqual([BASELINE_COLOR, "#123456", BASELINE_COLOR, "#123456"]);
    const pa = { ref: [], test: [], matches: [] } as unknown as Parameters<typeof peakMarkers>[0];
    const m = peakMarkers(pa, undefined, ["#111111", "#222222"]);
    expect(m.map((x) => (x.marker as { color: string }).color)).toEqual(["#111111", "#222222"]);
  });

  it("gói nhóm mang theo màu của file trong nhóm; xóa nhóm bỏ màu của nhóm đó", () => {
    const ws = { ...emptyWorkspace(), traceColors: { "f1#0": "#000000", "f2#1": "#ff0000" } };
    expect(workspaceFor(ws, ["SN"], new Set(["f1"])).traceColors).toEqual({ "f1#0": "#000000" });
    expect(workspaceWithout(ws, ["SN"], new Set(["f1"])).traceColors).toEqual({ "f2#1": "#ff0000" });
  });
});
