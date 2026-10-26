/** Files without a measurement date: never a default session; entering a date makes them pair. */
import { describe, expect, it } from "vitest";
import { groupTraces, UNKNOWN_DAY } from "../src/core/pairing";
import { emptySetting, type Trace } from "../src/core/types";
import { regroup } from "../src/workspace";

let n = 0;
const trace = (label: string, date: Date | null): Trace => ({
  id: `d${n++}`, freq: [1, 2], magDb: [0, 0], phaseDeg: [0, 0], peaksDb: null, traceName: label, sourceName: `${label}.csv`,
  sha256: `h${n}`, formatId: "x", formatLabel: "x", sections: [], setting: emptySetting(), serialNumber: "SN-1", location: "",
  transformerKey: "SN-1", testDate: date, dateSource: "", encoding: "utf-8", index: 1, label, parseNotes: [],
});

describe("thời điểm đo chưa xác định", () => {
  it("kỳ không rõ ngày xếp cuối, không là baseline hay lần đo mặc định", () => {
    const [g] = groupTraces([trace("A-a", null), trace("A-a", new Date(2024, 4, 1))]);
    expect(g.sessions).toEqual(["2024-05-01", UNKNOWN_DAY]);
    expect([g.baselineSession, g.testSession]).toEqual(["2024-05-01", "2024-05-01"]);
  });

  it("nhập ngày cho file chưa có ngày thì thành kỳ mới và ghép cặp", () => {
    const dated = trace("A-a", new Date(2024, 4, 1));
    const undated = trace("A-a", null);
    const before = groupTraces([dated, undated]);
    const fixed = { ...undated, testDate: new Date(2019, 10, 16, 14, 38) };
    const [g] = regroup([dated, fixed], before);
    expect([g.baselineSession, g.testSession]).toEqual(["2019-11-16", "2024-05-01"]);
    expect([g.rows[0].baselineId, g.rows[0].testId]).toEqual([undated.id, dated.id]);
  });
});
