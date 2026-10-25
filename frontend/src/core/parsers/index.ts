import { sha256Hex, type Standards } from "../standards";
import { ParseError, type Trace } from "../types";
import { decodeBytes } from "./common";
import { parseDobleSfra, sniffDobleSfra } from "./dobleSfra";
import { parseFrax, sniffFrax } from "./frax";
import { parseFraV2, sniffFraV2 } from "./fraV2Csv";
import { looksLikeCsv, NeedsMappingError, parseGenericCsv, signatureOf, sniffGenericCsv, type CsvProfile } from "./genericCsv";

/**
 * Parse one file into one or more traces (FRAX files hold several sweeps).
 * Generic CSV: a saved profile with the same header wins; otherwise a confident auto-detection
 * is used; otherwise NeedsMappingError asks the user to map the columns.
 */
export async function parseFile(
  bytes: Uint8Array, filename: string, std: Standards, profiles: CsvProfile[] = [], forced?: CsvProfile,
): Promise<Trace[]> {
  const sha = await sha256Hex(bytes);
  const head = decodeBytes(bytes.subarray(0, 4096)).text;
  if (!forced) {
    if (sniffFraV2(head)) return [parseFraV2(bytes, filename, sha)];
    if (sniffDobleSfra(head)) return [parseDobleSfra(bytes, filename, sha)];
    if (sniffFrax(head)) {
      const fx = std.vendors?.frax ?? {};
      const notes = fx.phase_confirmed ? [] : [`Định dạng FRAX: góc pha = ${fx.phase_deg} chưa đối chiếu với phần mềm FRAX.`];
      if (!fx.magnitude_confirmed) notes.unshift(`Định dạng FRAX: biên độ = ${fx.magnitude_db} chưa đối chiếu với phần mềm FRAX.`);
      return parseFrax(bytes, filename, sha, notes);
    }
  }
  const { text } = decodeBytes(bytes);
  if (forced) return [parseGenericCsv(bytes, filename, sha, forced, `Đọc theo hồ sơ ánh xạ "${forced.name}".`)];
  if (looksLikeCsv(text)) {
    const sn = sniffGenericCsv(text, std);
    const prof = profiles.find((p) => p.signature === signatureOf(sn.headers) && p.delimiter === sn.delimiter);
    if (prof) return [parseGenericCsv(bytes, filename, sha, prof, `Đọc theo hồ sơ ánh xạ "${prof.name}".`)];
    if (sn.confident) {
      const g = sn.guess;
      const units = `tần số ${g.freqUnit}, biên độ ${g.magUnit === "linear" ? "tỷ số tuyến tính (đổi sang dB)" : "dB"}, pha ${g.phaseUnit === "rad" ? "radian" : "độ"}`;
      return [parseGenericCsv(bytes, filename, sha, g, `CSV tự nhận dạng: cột "${sn.headers[g.freqCol]}", "${sn.headers[g.magCol]}"${g.phaseCol !== null ? `, "${sn.headers[g.phaseCol]}"` : ""}; ${units}.`)];
    }
    throw new NeedsMappingError(sn, bytes, filename);
  }
  throw new ParseError("Không nhận dạng được định dạng file (hỗ trợ: FRA Data v2.0 .csv, Doble .sfra, Megger .frax, CSV khác)");
}

export { parseFilename } from "./common";
export { NeedsMappingError, type CsvProfile, type CsvSniff } from "./genericCsv";
