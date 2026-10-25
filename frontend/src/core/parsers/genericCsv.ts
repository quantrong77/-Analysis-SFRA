/**
 * Generic CSV of other instruments (spec 4.2): detect delimiter, decimal mark, header row and
 * columns; when detection is not certain the user maps the columns and the mapping is saved as
 * a vendor profile, reused for files with the same header.
 */
import { ParseError, emptySetting, type Trace } from "../types";
import type { Standards } from "../standards";
import { applyFileNaming, baseName, cleanArrays, decodeBytes, stripDateSuffix, transformerKeyOf } from "./common";
import { splitLine } from "./fraV2Csv";

export interface CsvProfile {
  id: string;
  name: string;
  /** normalised header line the profile applies to ("" = files without header) */
  signature: string;
  delimiter: string;
  decimalComma: boolean;
  /** index of the header line, −1 when there is none; data starts on the next line */
  headerRow: number;
  freqCol: number;
  magCol: number;
  phaseCol: number | null;
  freqUnit: "Hz" | "kHz" | "MHz";
  magUnit: "dB" | "linear";
  phaseUnit: "deg" | "rad";
}

export interface CsvSniff {
  delimiter: string;
  decimalComma: boolean;
  headerRow: number;
  headers: string[];
  preview: string[][];
  columnCount: number;
  guess: CsvProfile;
  confident: boolean;
  reasons: string[];
}

export class NeedsMappingError extends ParseError {
  constructor(public sniff: CsvSniff, public bytes: Uint8Array, public filename: string) {
    super("Không nhận dạng chắc chắn các cột; cần ánh xạ cột");
  }
}

const NUM = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;
const toNum = (s: string, comma: boolean) => {
  const t = s.trim();
  if (!NUM.test(t)) return NaN;
  return Number(comma ? t.replace(",", ".") : t);
};

export const signatureOf = (headers: string[]) => headers.map((h) => h.trim().toLowerCase()).join("|");

export function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 60);
  return lines.filter((l) => /[,;\t]/.test(l) && /\d/.test(l)).length >= 5;
}

export function sniffGenericCsv(text: string, std: Standards): CsvSniff {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const sample = lines.slice(0, 200);
  const reasons: string[] = [];

  // delimiter: the one giving the most lines with the same column count ≥ 2
  let best = { d: ",", score: -1, cols: 0 };
  for (const d of [";", "\t", ","]) {
    const counts = new Map<number, number>();
    for (const l of sample) if (l.trim()) counts.set(splitLine(l, d).length, (counts.get(splitLine(l, d).length) ?? 0) + 1);
    const [cols, score] = [...counts].filter(([c]) => c >= 2).sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    if (score > best.score) best = { d, score, cols };
  }
  const delimiter = best.d;
  const rows = lines.map((l) => splitLine(l, delimiter).map((c) => c.trim()));
  // decimal comma: numbers like 12,5 only possible when the delimiter is not a comma
  const decimalComma = delimiter !== "," && rows.slice(0, 200).some((r) => r.some((c) => /^[+-]?\d+,\d+([eE][+-]?\d+)?$/.test(c)));

  const isData = (r: string[]) => r.filter((c) => !Number.isNaN(toNum(c, decimalComma))).length >= 2;
  const firstData = rows.findIndex(isData);
  if (firstData < 0) throw new ParseError("Không tìm thấy dòng số liệu trong file CSV");
  let headerRow = -1;
  for (let i = firstData - 1; i >= 0; i--) {
    if (rows[i].some((c) => c)) {
      headerRow = i;
      break;
    }
  }
  const headers = headerRow >= 0 ? rows[headerRow] : [];
  const columnCount = rows[firstData].length;

  const kw = std.vendors.generic_csv.keywords as Record<string, string[]>;
  const findCol = (keys: string[], exclude: number[]) =>
    headers.findIndex((h, i) => !exclude.includes(i) && keys.some((k) => h.toLowerCase().includes(k)));
  let freqCol = findCol(kw.freq, []);
  let magCol = headers.findIndex((h, i) => i !== freqCol && /db/i.test(h));
  if (magCol < 0) magCol = findCol(kw.mag, [freqCol]);
  let phaseCol: number | null = findCol(kw.phase, [freqCol, magCol]);
  if (phaseCol < 0) phaseCol = null;
  if (freqCol < 0 || magCol < 0) {
    reasons.push(headers.length ? "Tiêu đề cột không chứa từ khóa tần số / biên độ" : "File không có dòng tiêu đề");
    freqCol = 0;
    magCol = 1;
    phaseCol = columnCount > 2 ? 2 : null;
  }
  const h = (i: number | null) => (i === null ? "" : (headers[i] ?? "").toLowerCase());
  const freqUnit = /mhz/.test(h(freqCol)) ? "MHz" : /khz/.test(h(freqCol)) ? "kHz" : "Hz";
  const data = rows.slice(firstData, firstData + 2000).filter(isData);
  const mags = data.map((r) => toNum(r[magCol] ?? "", decimalComma)).filter(Number.isFinite);
  const freqs = data.map((r) => toNum(r[freqCol] ?? "", decimalComma)).filter(Number.isFinite);
  const statedDb = /db/.test(h(magCol));
  const statedLinear = (kw.linear ?? []).some((k) => h(magCol).includes(k));
  const allPositive = mags.length > 0 && mags.every((v) => v > 0);
  const magUnit: CsvProfile["magUnit"] =
    statedDb ? "dB" : statedLinear || (std.vendors.generic_csv.linear_if_all_positive && allPositive) ? "linear" : "dB";
  const phaseUnit: CsvProfile["phaseUnit"] = /rad/.test(h(phaseCol)) ? "rad" : "deg";
  if (freqs.length < 2 || freqs.some((v, i) => i > 0 && v < freqs[i - 1])) reasons.push("Cột tần số chọn được không tăng dần");
  if (!statedDb && !statedLinear) {
    reasons.push(
      magUnit === "linear"
        ? "Biên độ không ghi đơn vị; đoán là tỷ số tuyến tính vì mọi giá trị dương"
        : "Biên độ không ghi đơn vị; đoán là dB",
    );
  }

  const guess: CsvProfile = {
    id: "", name: "", signature: signatureOf(headers), delimiter, decimalComma, headerRow,
    freqCol, magCol, phaseCol, freqUnit, magUnit, phaseUnit,
  };
  const confident = reasons.length === 0;
  return { delimiter, decimalComma, headerRow, headers, preview: rows.slice(Math.max(0, headerRow), firstData + 8), columnCount, guess, confident, reasons };
}

export function parseGenericCsv(bytes: Uint8Array, filename: string, sha256: string, profile: CsvProfile, note: string): Trace {
  const { text, encoding } = decodeBytes(bytes);
  const rows = text.replace(/^﻿/, "").split(/\r\n|\n|\r/).map((l) => splitLine(l, profile.delimiter).map((c) => c.trim()));
  const fMul = profile.freqUnit === "MHz" ? 1e6 : profile.freqUnit === "kHz" ? 1e3 : 1;
  const freq: number[] = [];
  const mag: number[] = [];
  const phase: number[] = [];
  for (const r of rows.slice(profile.headerRow + 1)) {
    const f = toNum(r[profile.freqCol] ?? "", profile.decimalComma);
    const m = toNum(r[profile.magCol] ?? "", profile.decimalComma);
    if (!Number.isFinite(f) || !Number.isFinite(m)) continue;
    const p = profile.phaseCol === null ? 0 : toNum(r[profile.phaseCol] ?? "", profile.decimalComma);
    freq.push(f * fMul);
    mag.push(profile.magUnit === "linear" ? 20 * Math.log10(Math.abs(m)) : m);
    phase.push(profile.phaseUnit === "rad" ? (p * 180) / Math.PI : p);
  }
  const c = cleanArrays(freq, mag, phase, null);
  if (c.freq.length < 2) throw new ParseError("File CSV không có đủ dữ liệu theo ánh xạ cột đã chọn");
  const stem = stripDateSuffix(baseName(filename).replace(/\.[^.]+$/, ""));
  const t: Trace = {
    id: `${sha256}#0`, freq: c.freq, magDb: c.mag, phaseDeg: c.phase, peaksDb: null,
    traceName: stem, sourceName: filename, sha256, formatId: "generic_csv",
    formatLabel: profile.name ? `CSV (hồ sơ "${profile.name}")` : "CSV (tự nhận dạng)",
    sections: [{ name: "csvProfile", items: { profile: profile.name || "(tự nhận dạng)", delimiter: profile.delimiter, decimalComma: String(profile.decimalComma), freqUnit: profile.freqUnit, magUnit: profile.magUnit, phaseUnit: profile.phaseUnit } }],
    setting: emptySetting(), serialNumber: "", location: "", transformerKey: transformerKeyOf(""),
    testDate: null, dateSource: "", encoding, index: null, label: "", parseNotes: [note],
  };
  if (profile.phaseCol === null) t.parseNotes.push("File không có cột góc pha; góc pha đặt bằng 0.");
  applyFileNaming(t, stem);
  return t;
}
