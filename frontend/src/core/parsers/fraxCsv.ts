/**
 * CSV exported by the Megger FRAX software: INI-like sections, one test holding several sweeps.
 *   [Format] [Transformer] [Test]  one header line, one value line each
 *   [Traces]  Index;Color;SweepName;Date;...   one line per sweep the test declares
 *   [Data]    Index;Frequency;Magnitude;Phase  points of every exported sweep, told apart by Index
 * Magnitude is in dB and Phase in degrees (standards.yaml vendors.frax_csv: checked point by point
 * against the .frax file of the same test). A sweep listed in [Traces] may have no points in [Data]
 * when it was not exported; it is reported, not invented.
 */
import { ParseError, type Section, type Trace, emptySetting } from "../types";
import { cleanArrays, decodeBytes, transformerKeyOf } from "./common";
import { splitLine } from "./fraV2Csv";

export function sniffFraxCsv(text: string): boolean {
  const t = text.replace(/^﻿/, "").trimStart();
  return t.startsWith("[Format]") && /^\[Traces\]\s*$/m.test(t);
}

/** "[Name]" followed by a header line and value lines, up to the next section. */
function sections(text: string): Map<string, { header: string[]; rows: string[][] }> {
  const out = new Map<string, { header: string[]; rows: string[][] }>();
  let cur: { header: string[]; rows: string[][] } | null = null;
  for (const raw of text.replace(/^﻿/, "").split(/\r\n|\n|\r/)) {
    const line = raw.trimEnd();
    const m = /^\[(.+)\]$/.exec(line.trim());
    if (m) {
      cur = { header: [], rows: [] };
      out.set(m[1].trim(), cur);
    } else if (cur && line.trim()) {
      const cells = splitLine(line, ";").map((c) => c.trim());
      if (!cur.header.length) cur.header = cells;
      else cur.rows.push(cells);
    }
  }
  return out;
}

const record = (s: { header: string[]; rows: string[][] } | undefined, row = 0): Record<string, string> => {
  const r: Record<string, string> = {};
  if (s) s.header.forEach((h, i) => (r[h] = /^nan$/i.test(s.rows[row]?.[i] ?? "") ? "" : (s.rows[row]?.[i] ?? "")));
  return r;
};

// numbers use a point; a comma is taken as the decimal mark (export on a comma-decimal Windows locale)
const num = (s: string | undefined) => (s === undefined || s === "" ? NaN : Number(s.replace(",", ".")));

function parseDateTime(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s.trim());
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) : null;
}

/** "NLTCPos: x¶LTCPos: y¶Reason: …" in the test notes */
function noteFields(notes: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of notes.split(/¶|\n/)) {
    const m = /^\s*([^:]+):\s*(.*)$/.exec(part);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

export function parseFraxCsv(bytes: Uint8Array, filename: string, sha256: string): Trace[] {
  const { text, encoding } = decodeBytes(bytes);
  const sec = sections(text);
  const data = sec.get("Data");
  const traces = sec.get("Traces");
  if (!data || !traces) throw new ParseError("File CSV FRAX thiếu mục [Traces] hoặc [Data]");

  const col = (h: string[], name: string) => h.findIndex((x) => x.toLowerCase() === name.toLowerCase());
  const [di, df, dm, dp] = ["Index", "Frequency", "Magnitude", "Phase"].map((n) => col(data.header, n));
  if ([di, df, dm, dp].some((i) => i < 0)) throw new ParseError("Mục [Data] cần các cột Index, Frequency, Magnitude, Phase");

  const points = new Map<string, { f: number[]; m: number[]; p: number[] }>();
  for (const r of data.rows) {
    const k = r[di];
    if (!points.has(k)) points.set(k, { f: [], m: [], p: [] });
    const pt = points.get(k)!;
    pt.f.push(num(r[df]));
    pt.m.push(num(r[dm]));
    pt.p.push(num(r[dp]));
  }

  const tx = record(sec.get("Transformer"));
  const test = record(sec.get("Test"));
  const notes = noteFields(test["Notes"] ?? "");
  const serial = (tx["SerialNumber"] ?? "").trim();
  const location = (tx["TransformerLocation"] || test["Location"] || "").trim();
  const declared = traces.rows.map((_, i) => record(traces, i));
  // points under an Index that [Traces] does not list are kept, named by their Index
  for (const k of points.keys()) if (!declared.some((t) => t["Index"] === k)) declared.push({ Index: k });
  const named = (t: Record<string, string>) => t["SweepName"] || `Sweep ${t["Index"]}`;
  const missing = declared.filter((t) => !points.get(t["Index"])?.f.length).map(named);
  const fileNote = missing.length
    ? `Không có số liệu của: ${missing.join(", ")} (có trong danh sách phép đo của file nhưng chưa được xuất ra CSV).`
    : "";

  const out = declared
    .filter((t) => points.get(t["Index"])?.f.length)
    .map((t) => {
      const pt = points.get(t["Index"])!;
      const c = cleanArrays(pt.f, pt.m, pt.p, null);
      const name = named(t);
      if (c.freq.length < 2) throw new ParseError(`Phép đo "${name}" không đủ số liệu`);
      const date = parseDateTime(t["Date"] ?? "") ?? parseDateTime(test["TestDate"] ?? "");
      const secs: Section[] = [
        { name: "Transformer", items: tx },
        { name: "Test", items: { ...test, Notes: (test["Notes"] ?? "").replace(/¶/g, "; ") } },
        { name: "Sweep", items: { Index: t["Index"], Name: name, Date: t["Date"] ?? "", Comment: t["Comment"] ?? "" } },
      ];
      return {
        id: `${sha256}#${t["Index"]}`,
        freq: c.freq, magDb: c.mag, phaseDeg: c.phase, peaksDb: null,
        traceName: name, sourceName: filename, sha256, formatId: "frax_csv", formatLabel: "Megger FRAX (.csv)",
        sections: secs,
        setting: { ...emptySetting(), ltcPosition: notes["LTCPos"] ?? "", detcPosition: notes["NLTCPos"] ?? "" },
        serialNumber: serial, location,
        transformerKey: transformerKeyOf(serial, location),
        testDate: date, dateSource: date ? "Metadata trong file" : "", encoding,
        index: null, label: name,
        parseNotes: [
          `Phép đo ${declared.indexOf(t) + 1}/${declared.length} của file${t["SweepName"] ? "" : ", không ghi tên nên đặt theo Index"}.`,
          ...(fileNote ? [fileNote] : []),
        ],
      } satisfies Trace;
    });
  if (!out.length) throw new ParseError(fileNote || "File CSV FRAX không có số liệu phép đo nào");
  return out;
}
