/** Measurement files of a training pack, parsed with the same readers as the analysis screens. */
import { NeedsMappingError, parseFile, type CsvProfile } from "../../core/parsers";
import type { Standards } from "../../core/standards";
import type { Trace } from "../../core/types";
import type { PackFile } from "../../core/training/pack";

export async function parsePackFiles(
  files: PackFile[], std: Standards, profiles: CsvProfile[],
): Promise<{ traces: Trace[]; errors: string[] }> {
  const traces: Trace[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      traces.push(...(await parseFile(f.bytes, f.name, std, profiles)));
    } catch (e) {
      errors.push(
        e instanceof NeedsMappingError
          ? `${f.name}: file CSV chưa nhận dạng được cột; ánh xạ cột ở mục Nhập dữ liệu trước rồi soạn lại.`
          : `${f.name}: ${(e as Error).message}`,
      );
    }
  }
  return { traces, errors };
}

/** How a curve is named in the selects of the training screens */
export const traceLabel = (t: Trace): string => {
  const d = t.testDate ? `${String(t.testDate.getDate()).padStart(2, "0")}/${String(t.testDate.getMonth() + 1).padStart(2, "0")}/${t.testDate.getFullYear()}` : "chưa rõ ngày";
  return `${t.index !== null ? `${t.index} ` : ""}${t.label}, ${d}, ${t.sourceName}`;
};
