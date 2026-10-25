/** "[FRA Data v2.0]" CSV (spec 4.1). Same rules as backend/app/parsers/fra_v2_csv.py. */
import { ParseError, type Section, type Trace } from "../types";
import {
  applyFileNaming, cleanArrays, decodeBytes, meta, section, settingFrom, stripDateSuffix, transformerKeyOf,
} from "./common";

export const HEADER = "[FRA Data v2.0]";
const SECTION_RE = /^\[(.+)\]$/;
const ATTR_RE = /\s+\w+\s*=\s*"[^"]*"/g;

export function sniffFraV2(text: string): boolean {
  return text.replace(/^﻿/, "").trimStart().startsWith(HEADER);
}

function detectDelimiter(firstLine: string): string {
  const rest = firstLine.replace(/^﻿/, "").trim().slice(HEADER.length);
  for (const d of [",", ";", "\t"]) if (rest.startsWith(d)) return d;
  return ",";
}

/** Minimal CSV line split; like Python's csv module, a quote is special only at the start of a field. */
export function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && cur === "") q = true;
    else if (c === delim) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function toFloat(cell: string | undefined, decimalComma: boolean): number | null {
  if (cell === undefined) return null;
  let s = cell.trim();
  if (!s) return null;
  if (decimalComma) s = s.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$|^[+-]?(nan|inf(inity)?)$/i.test(s)) return null;
  const v = Number(s.toLowerCase().startsWith("nan") ? NaN : s);
  return Number.isNaN(v) && !/nan/i.test(s) ? null : v;
}

export function parseFraV2(bytes: Uint8Array, filename: string, sha256: string): Trace {
  const { text, encoding } = decodeBytes(bytes);
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  if (!lines.length || !lines[0].trim().startsWith(HEADER)) throw new ParseError(`Không phải định dạng ${HEADER}`);
  const delim = detectDelimiter(lines[0]);
  const decimalComma = delim !== ",";
  const rows = lines.map((l) => splitLine(l, delim));

  const hdrIdx = rows.slice(0, 20).findIndex((r) => r[0]?.trim().toLowerCase().endsWith("freq"));
  if (hdrIdx < 0) throw new ParseError("Không tìm thấy dòng tiêu đề cột (… freq, … RMS, … Peaks, … Phase)");
  const header = rows[hdrIdx].map((c) => c.trim());
  const find = (suffix: string) => {
    const i = header.findIndex((h) => h.toLowerCase().endsWith(suffix));
    return i < 0 ? null : i;
  };
  const cFreq = find("freq") as number;
  const cRms = find("rms");
  const cPeaks = find("peaks");
  const cPhase = find("phase");
  if (cRms === null || cPhase === null) throw new ParseError("Thiếu cột RMS hoặc Phase trong dòng tiêu đề");
  const traceName = header[0].slice(0, -4).trim();

  // Data: stop at the first non-numeric row (no row limit).
  const freq: number[] = [];
  const rms: number[] = [];
  const peaks: number[] = [];
  const phase: number[] = [];
  let i = hdrIdx + 1;
  for (; i < rows.length; i++) {
    const r = rows[i];
    const f = toFloat(r[cFreq], decimalComma);
    if (f === null || !Number.isFinite(f)) break;
    const v = (c: number | null) => (c === null ? NaN : toFloat(r[c], decimalComma) ?? NaN);
    freq.push(f);
    rms.push(v(cRms));
    peaks.push(v(cPeaks));
    phase.push(v(cPhase));
  }
  if (freq.length < 2) throw new ParseError("File không có dữ liệu đo (ít hơn 2 điểm)");

  const preamble: Section = { name: "_preamble", items: {} };
  for (const r of rows.slice(1, hdrIdx)) {
    const cells = r.map((c) => c.trim());
    for (let k = 0; k + 1 < cells.length; k += 2) if (cells[k]) preamble.items[cells[k]] = cells[k + 1];
  }
  const sections: Section[] = [preamble, ...readSections(rows.slice(i), delim)];

  const c = cleanArrays(freq, rms, phase, peaks);
  const hasPeaks = c.peaks?.some(Number.isFinite) ?? false;

  const nameplate = sections.find((s) => s.name.startsWith("nameplate") && s.name !== "nameplate end");
  const np = nameplate?.items ?? {};
  const serial = (np["Serial Number"] ?? "").trim() || meta(sections, "transformerNameplate", "serialNumber");
  const location = (np["Location"] ?? "").trim() || meta(sections, "apparatusLocation", "location");

  const t: Trace = {
    id: `${sha256}#0`,
    freq: c.freq, magDb: c.mag, phaseDeg: c.phase, peaksDb: hasPeaks ? c.peaks : null,
    traceName, sourceName: filename, sha256, formatId: "fra_v2_csv", formatLabel: "FRA Data v2.0 (.csv)",
    sections, setting: settingFrom(sections), serialNumber: serial, location,
    transformerKey: transformerKeyOf(serial, location),
    testDate: null, dateSource: "", encoding, index: null, label: "", parseNotes: [],
  };

  const setup = section(sections, "testSetup");
  t.testDate = parseDmy(setup?.items["timestamp"] ?? "") ??
    parseDmy(`${np["Test Date"] ?? ""} ${np["Test Time"] ?? ""}`.trim());
  t.dateSource = t.testDate ? "Metadata trong file" : "";
  const fileDate = t.testDate;
  applyFileNaming(t, stripDateSuffix(traceName));
  if (fileDate && t.dateSource !== "Tên file") {
    t.testDate = fileDate;
    t.dateSource = "Metadata trong file";
  }
  return t;
}

function readSections(rows: string[][], delim: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const r of rows) {
    const cells = r.map((c) => c.trim());
    if (!cells.some(Boolean)) continue;
    const m = SECTION_RE.exec(cells[0]);
    if (m) {
      cur = { name: m[1].replace(ATTR_RE, "").trim(), items: {} };
      out.push(cur);
      continue;
    }
    if (!cur) {
      cur = { name: "_orphan", items: {} };
      out.push(cur);
    }
    let key = cells[0];
    const value = cells.slice(1).join(delim).replace(new RegExp(`[${delim === "\t" ? "\\t" : delim}]+$`), "").trim();
    if (key in cur.items) {
      let n = 2;
      while (`${key}#${n}` in cur.items) n++;
      key = `${key}#${n}`;
    }
    cur.items[key] = value;
  }
  return out;
}

/** dd/mm/yyyy [hh:mm[:ss]] as local time. */
export function parseDmy(s: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0", sec = "0"] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +sec);
}
