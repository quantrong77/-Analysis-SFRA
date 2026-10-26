/** New / lost peaks and notches counted per DL/T 911 band. */
import { expect, it } from "vitest";
import { peakCounts, type PeakAnalysis, type PeakMatch } from "../src/core/peaks";
import { std } from "./helpers";

const m = (kind: PeakMatch["kind"], status: PeakMatch["status"], band: string) => ({ kind, status, band }) as PeakMatch;

it("đếm đỉnh/hố mới và mất theo dải, ngoài dải tách riêng", async () => {
  const s = await std;
  const pa = {
    matches: [
      m("peak", "new", "LF"), m("peak", "new", "LF"), m("peak", "lost", "MF"), m("notch", "lost", "HF"),
      m("notch", "new", ">1 MHz"), m("peak", "ok", "LF"), m("peak", "alarm", "MF"),
    ],
  } as PeakAnalysis;
  const c = Object.fromEntries(peakCounts(pa, s).map((x) => [x.band, x]));
  expect(c.LF).toMatchObject({ peaksNew: 2, peaksLost: 0, notchesNew: 0, notchesLost: 0 });
  expect(c.MF).toMatchObject({ peaksNew: 0, peaksLost: 1 });
  expect(c.HF).toMatchObject({ notchesLost: 1 });
  expect(c.outside).toMatchObject({ notchesNew: 1, peaksNew: 0 });
});
