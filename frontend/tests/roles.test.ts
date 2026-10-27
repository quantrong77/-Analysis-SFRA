/** Files loaded in the baseline frame or the test frame decide which sessions are compared. */
import { describe, expect, it } from "vitest";
import { groupTraces } from "../src/core/pairing";
import { emptySetting, type Trace } from "../src/core/types";
import { applyRoles, regroup, type FileRole } from "../src/workspace";

let n = 0;
const trace = (label: string, date: Date): Trace => {
  const sha = `r${n++}`;
  return {
    id: `${sha}#0`, freq: [1, 2], magDb: [0, 0], phaseDeg: [0, 0], peaksDb: null, traceName: label, sourceName: `${label}.csv`,
    sha256: sha, formatId: "x", formatLabel: "x", sections: [], setting: emptySetting(), serialNumber: "SN-1", location: "",
    transformerKey: "SN-1", testDate: date, dateSource: "", encoding: "utf-8", index: 1, label, parseNotes: [],
  };
};

describe("kỳ so sánh theo khung nạp file", () => {
  it("file nạp ở khung baseline thành kỳ baseline, kể cả khi ngày đo muộn hơn lần đo", () => {
    const later = trace("A-a", new Date(2026, 4, 10));
    const earlier = trace("A-a", new Date(2025, 0, 5));
    const roles: Record<string, FileRole> = { [later.sha256]: "baseline", [earlier.sha256]: "test" };
    const [g0] = groupTraces([later, earlier]);
    const fresh = new Map<string, FileRole>(Object.entries(roles));
    const g = applyRoles(g0, [later, earlier], roles, fresh);
    expect([g.baselineSession, g.testSession]).toEqual(["2026-05-10", "2025-01-05"]);
    expect([g.rows[0].baselineId, g.rows[0].testId]).toEqual([later.id, earlier.id]);
  });

  it("nạp thêm file lần đo sau: giữ baseline đã có, lần đo là ngày của file mới", () => {
    const base = trace("A-a", new Date(2019, 10, 16));
    const mid = trace("A-a", new Date(2024, 2, 1));
    const now = trace("A-a", new Date(2026, 4, 10));
    const roles: Record<string, FileRole> = { [base.sha256]: "baseline", [mid.sha256]: "test" };
    const [g1] = groupTraces([base, mid]);
    const before = applyRoles(g1, [base, mid], roles, new Map(Object.entries(roles)));
    roles[now.sha256] = "test";
    const [g2] = regroup([base, mid, now], [before]);
    const g = applyRoles(g2, [base, mid, now], roles, new Map([[now.sha256, "test" as FileRole]]));
    expect([g.baselineSession, g.testSession]).toEqual(["2019-11-16", "2026-05-10"]);
  });

  it("không có file mới nạp qua khung thì giữ nguyên lựa chọn", () => {
    const a = trace("A-a", new Date(2019, 10, 16));
    const b = trace("A-a", new Date(2026, 4, 10));
    const [g0] = groupTraces([a, b]);
    expect(applyRoles(g0, [a, b], {}, new Map())).toBe(g0);
  });
});
