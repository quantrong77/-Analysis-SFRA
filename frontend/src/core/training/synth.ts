/** Curves made in the app (simulation), shaped like parsed traces so the analysis code can use them. */
import { emptySetting, type Trace } from "../types";

/** A curve made in the app (simulation), shaped like a parsed trace so the analysis code can use it */
export function synthTrace(id: string, label: string, freq: number[], magDb: number[], phaseDeg: number[]): Trace {
  return {
    id, freq, magDb, phaseDeg, peaksDb: null, traceName: label, sourceName: "(mô phỏng)", sha256: id, formatId: "sim",
    formatLabel: "Mô phỏng", sections: [], setting: emptySetting(), serialNumber: "", location: "", transformerKey: "(mô phỏng)",
    testDate: null, dateSource: "", encoding: "", index: null, label, parseNotes: [],
  };
}

