/** Doble SFRA XML (.sfra): <sfraData><...><data><d>f,dB,deg</d>... */
import { ParseError, type Trace } from "../types";
import { applyFileNaming, cleanArrays, decodeBytes, meta, settingFrom, stripDateSuffix, transformerKeyOf } from "./common";
import { child, leafSections, parseXml } from "./xml";

export function sniffDobleSfra(text: string): boolean {
  return /<sfraData[\s>]/.test(text.slice(0, 2000));
}

export function parseDobleSfra(bytes: Uint8Array, filename: string, sha256: string): Trace {
  const { text, encoding } = decodeBytes(bytes);
  const root = child(parseXml(text), "sfraData");
  if (!root) throw new ParseError("Không tìm thấy phần tử <sfraData>");
  const data = child(root, "data");
  const freq: number[] = [];
  const mag: number[] = [];
  const phase: number[] = [];
  for (const d of data?.children ?? []) {
    if (d.name !== "d") continue;
    const [f, m, p] = d.text.split(",").map((s) => Number(s.trim()));
    freq.push(f);
    mag.push(m);
    phase.push(p);
  }
  if (freq.length < 2) throw new ParseError("File .sfra không có dữ liệu đo (<d>)");
  const c = cleanArrays(freq, mag, phase, null);
  const sections = leafSections(root, new Set(["data"]));
  const serial = meta(sections, "transformerNameplate", "serialNumber");
  const location = meta(sections, "apparatusLocation", "location");
  const traceName = meta(sections, "testSetup", "traceName");

  const t: Trace = {
    id: `${sha256}#0`,
    freq: c.freq, magDb: c.mag, phaseDeg: c.phase, peaksDb: null,
    traceName, sourceName: filename, sha256, formatId: "doble_sfra", formatLabel: "Doble SFRA (.sfra)",
    sections, setting: settingFrom(sections), serialNumber: serial, location,
    transformerKey: transformerKeyOf(serial, location),
    testDate: null, dateSource: "", encoding, index: null, label: "", parseNotes: [],
  };
  applyFileNaming(t, stripDateSuffix(traceName) || filename);
  if (!t.testDate) {
    // <timeStamp> is M/D/YYYY in UTC; 01/01/2000 is a placeholder written by the instrument.
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(meta(sections, "testSetup", "timeStamp"));
    if (m && +m[3] > 2000) {
      t.testDate = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]));
      t.dateSource = "timeStamp trong file (UTC)";
    } else {
      t.parseNotes.push("Không xác định được ngày đo (timeStamp trong file là giá trị mặc định); hãy nhập ngày đo.");
    }
  }
  return t;
}
