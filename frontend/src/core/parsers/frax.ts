/**
 * Megger FRAX (.frax, XML "Frameworx"). One file holds several sweeps.
 * Each <Data> point: f,c1,c2,c3,c4,c5,c6 = three magnitude/phase pairs, (c1∠c4) = (c2∠c5)/(c3∠c6),
 * phases in radians; c3∠c6 is the transfer function (standards.yaml vendors.frax):
 *   magnitude dB = 20·log10(c3)  - checked against the FRAX software (a-x, 10 kHz ≈ −16 dB)
 *   phase deg = c6·180/π         - checked against the FRAX software (a-x, 10 kHz ≈ −70.7°)
 */
import { ParseError, type Section, type Trace, emptySetting } from "../types";
import { cleanArrays, decodeBytes, transformerKeyOf } from "./common";
import { child, children, leafSections, parseXml, textOf } from "./xml";

export function sniffFrax(text: string): boolean {
  return /<Frameworx[\s>]/.test(text.slice(0, 2000));
}

function parseYmdHms(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!d) return null;
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim()) ?? [];
  return new Date(+d[1], +d[2] - 1, +d[3], +(t[1] ?? 0), +(t[2] ?? 0), +(t[3] ?? 0));
}

export function parseFrax(bytes: Uint8Array, filename: string, sha256: string, notes: string[]): Trace[] {
  const { text, encoding } = decodeBytes(bytes);
  const root = child(parseXml(text), "Frameworx");
  if (!root) throw new ParseError("Không tìm thấy phần tử <Frameworx>");
  const nameplate = child(root, "Nameplate");
  const npSections: Section[] = nameplate ? leafSections(nameplate) : [];
  const np = npSections[0]?.items ?? {};
  const serial = (np["SerialNumber"] ?? "").trim();
  const object = (np["Object"] ?? "").trim();
  const location = (np["Location"] ?? "").trim();
  const record = child(child(root, "Frax"), "TestRecord");
  const sweeps = children(record, "Sweep");
  if (!sweeps.length) throw new ParseError("File FRAX không có <Sweep>");

  return sweeps.map((sw, k) => {
    const name = textOf(sw, "Name") || `Sweep ${k + 1}`;
    const freq: number[] = [];
    const mag: number[] = [];
    const phase: number[] = [];
    for (const pt of textOf(sw, "Data").split(";")) {
      const v = pt.split(",").map((s) => Number(s.trim()));
      if (v.length < 7) continue;
      const [f, , , c3, , , c6] = v;
      freq.push(f);
      mag.push(20 * Math.log10(c3));
      phase.push((c6 * 180) / Math.PI);
    }
    if (freq.length < 2) throw new ParseError(`Sweep "${name}" không có dữ liệu`);
    const c = cleanArrays(freq, mag, phase, null);
    const sys = child(sw, "System");
    const sections: Section[] = [
      ...npSections,
      { name: "Sweep", items: { Name: name, Date: textOf(sw, "Date"), Time: textOf(sw, "Time"), Ident: textOf(sw, "Ident") } },
      ...(sys ? leafSections(sys) : []),
    ];
    const date = parseYmdHms(textOf(sw, "Date"), textOf(sw, "Time")) ??
      parseYmdHms(np["TestDate"] ?? np["Date"] ?? "", np["Time"] ?? "");
    return {
      id: `${sha256}#${k}`,
      freq: c.freq, magDb: c.mag, phaseDeg: c.phase, peaksDb: null,
      traceName: name, sourceName: filename, sha256, formatId: "frax", formatLabel: "Megger FRAX (.frax)",
      sections, setting: { ...emptySetting(), ltcPosition: (np["LTCPos"] ?? "").trim(), detcPosition: (np["NLTCPos"] ?? "").trim() },
      serialNumber: serial, location: location || object,
      transformerKey: transformerKeyOf(serial, object, location),
      testDate: date, dateSource: date ? "Metadata trong file" : "", encoding,
      index: null, label: name, parseNotes: [...notes],
    } satisfies Trace;
  });
}
