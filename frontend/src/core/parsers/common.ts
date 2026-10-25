import { emptySetting, ParseError, type Section, type TestSetting, type Trace } from "../types";

// STT_PhepDo_YYYY-MM-DD_HH-MM-SS[_n].csv|sfra, e.g. 1_A-a_2020-01-02_03-04-05.csv
const FILENAME_RE =
  /^(\d+)_(.+?)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_\d+)?\.(csv|sfra)$/i;
// <anything>_YYYY-MM-DD_HH-MM-SS[_n].ext (vendor files without STT)
const DATED_RE = /_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_\d+)?\.[^.]+$/;

export interface FileNameInfo {
  index: number;
  label: string;
  timestamp: Date;
}

export function baseName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

export function parseFilename(name: string): FileNameInfo | null {
  const m = FILENAME_RE.exec(baseName(name));
  if (!m) return null;
  const [, idx, label, y, mo, d, h, mi, s] = m;
  return { index: Number(idx), label, timestamp: new Date(+y, +mo - 1, +d, +h, +mi, +s) };
}

export function filenameDate(name: string): Date | null {
  const m = DATED_RE.exec(baseName(name));
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

/** Strip a trailing _YYYY-MM-DD_HH-MM-SS from a trace name ("c-C_2026-10-25_01-56-20" -> "c-C"). */
export function stripDateSuffix(s: string): string {
  return s.replace(/_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/, "").trim();
}

const ENCODINGS = ["utf-8", "windows-1258", "windows-1252"];

/** UTF-8 (with or without BOM), then cp1258 / cp1252 (spec 4.1). */
export function decodeBytes(bytes: Uint8Array): { text: string; encoding: string } {
  for (const enc of ENCODINGS) {
    try {
      const text = new TextDecoder(enc, { fatal: true }).decode(bytes);
      const bom = enc === "utf-8" && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
      return { text, encoding: bom ? "utf-8-sig" : enc };
    } catch {
      /* try next */
    }
  }
  throw new ParseError("Không giải mã được file (đã thử UTF-8-BOM, UTF-8, cp1258, cp1252)");
}

/** Drop NaN / non-positive frequencies, sort ascending, drop duplicate frequencies (keep first). */
export function cleanArrays(
  freq: number[], mag: number[], phase: number[], peaks: number[] | null,
): { freq: number[]; mag: number[]; phase: number[]; peaks: number[] | null } {
  const idx: number[] = [];
  for (let i = 0; i < freq.length; i++) {
    if (Number.isFinite(freq[i]) && freq[i] > 0 && Number.isFinite(mag[i]) && Number.isFinite(phase[i])) idx.push(i);
  }
  idx.sort((a, b) => freq[a] - freq[b] || a - b);
  const keep: number[] = [];
  for (const i of idx) if (!keep.length || freq[keep[keep.length - 1]] !== freq[i]) keep.push(i);
  return {
    freq: keep.map((i) => freq[i]),
    mag: keep.map((i) => mag[i]),
    phase: keep.map((i) => phase[i]),
    peaks: peaks ? keep.map((i) => peaks[i]) : null,
  };
}

export const SETTING_KEYS: Record<string, keyof TestSetting> = {
  redLead: "redLead",
  blackLead: "blackLead",
  measurementType: "measurementType",
  shortedTerminal: "shortedTerminal",
  groundedTerminal: "groundedTerminal",
  ltcPosition: "ltcPosition",
  detcPosition: "detcPosition",
};

export function section(sections: Section[], name: string, occurrence = 0): Section | undefined {
  return sections.filter((s) => s.name === name)[occurrence];
}

export function meta(sections: Section[], name: string, key: string): string {
  return (section(sections, name)?.items[key] ?? "").trim();
}

export function settingFrom(sections: Section[]): TestSetting {
  const ts = emptySetting();
  const s = section(sections, "testSetting");
  if (s) for (const [k, attr] of Object.entries(SETTING_KEYS)) ts[attr] = (s.items[k] ?? "").trim();
  if (!ts.measurementType) ts.measurementType = meta(sections, "testSetup", "measurementType");
  return ts;
}

/** Fill pairing key (STT + label) and date from the file name when it follows the naming rule. */
export function applyFileNaming(t: Trace, fallbackLabel: string): void {
  const info = parseFilename(t.sourceName);
  if (info) {
    t.index = info.index;
    t.label = info.label;
    t.testDate = info.timestamp;
    t.dateSource = "Tên file";
    return;
  }
  t.index = null;
  t.label = fallbackLabel;
  const d = filenameDate(t.sourceName);
  if (d) {
    t.testDate = d;
    t.dateSource = "Tên file";
  }
}

export function transformerKeyOf(serial: string, ...others: string[]): string {
  return serial.trim() || others.map((o) => o.trim()).find(Boolean) || "(không rõ số chế tạo)";
}
