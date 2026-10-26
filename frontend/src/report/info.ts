/**
 * General information for the report (spec 8, item 2). Pre-filled only from file metadata;
 * instrument placeholders ("0", "NewCompany", …) count as empty. The user edits before export.
 */
import { meta } from "../core/parsers/common";
import type { TransformerGroup } from "../core/pairing";
import { dayKey } from "../core/pairing";
import type { Standards } from "../core/standards";
import type { Trace } from "../core/types";

export interface ReportInfo {
  name: string;
  substation: string;
  manufacturer: string;
  serialNumber: string;
  year: string;
  voltage: string;
  power: string;
  baselineDate: string;
  testDate: string;
  reason: string;
  testedBy: string;
  instrument: string;
  tapPosition: string;
  organization: string;
  notes: string;
  decimalComma: boolean;
}

/**
 * Report header fields. The two dates follow the sessions being compared (`fromSession`): they are
 * edited where the measurement dates are (Import, "Sửa ngày"), so every view shows the same date.
 */
export const INFO_FIELDS: { key: keyof ReportInfo; label: string; wide?: boolean; fromSession?: boolean }[] = [
  { key: "name", label: "Tên MBA" },
  { key: "substation", label: "Trạm biến áp" },
  { key: "manufacturer", label: "Hãng sản xuất" },
  { key: "serialNumber", label: "Số chế tạo" },
  { key: "year", label: "Năm sản xuất" },
  { key: "voltage", label: "Cấp điện áp" },
  { key: "power", label: "Công suất" },
  { key: "baselineDate", label: "Ngày đo cơ sở", fromSession: true },
  { key: "testDate", label: "Ngày đo hiện tại", fromSession: true },
  { key: "reason", label: "Lý do đo" },
  { key: "testedBy", label: "Người thực hiện" },
  { key: "instrument", label: "Thiết bị đo" },
  { key: "tapPosition", label: "Vị trí nấc" },
  { key: "organization", label: "Đơn vị thực hiện", wide: true },
  { key: "notes", label: "Ghi chú", wide: true },
];

const REASONS: Record<string, string> = { routine: "Định kỳ" };

function clean(v: string, std: Standards): string {
  const s = v.trim();
  const ph: string[] = std.report.placeholder_values ?? [];
  if (!s || ph.some((p) => p.toLowerCase() === s.toLowerCase())) return "";
  return s;
}

/** Most frequent non-empty value among traces. */
function common(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

const nameplate = (t: Trace) =>
  t.sections.find((s) => s.name.startsWith("nameplate") && s.name !== "nameplate end")?.items ?? {};

export const fmtSession = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export function defaultInfo(group: TransformerGroup, traces: Trace[], std: Standards): ReportInfo {
  const list = traces.filter((t) => t.transformerKey === group.key);
  const test = list.filter((t) => dayKey(t.testDate) === group.testSession);
  const src = test.length ? test : list;
  const pick = (f: (t: Trace) => string) => common(src.map((t) => clean(f(t), std))) || common(list.map((t) => clean(f(t), std)));

  const kv = pick((t) => {
    const np = nameplate(t);
    const parts = ["kV Primary", "kV Secondary", "kV Tertiary"].map((k) => clean(np[k] ?? "", std)).filter(Boolean);
    return parts.length ? `${parts.join("/")} kV` : "";
  });
  const mva = pick((t) => {
    const np = nameplate(t);
    const parts = ["Power Primary", "Power Secondary", "Power Tertiary"].map((k) => clean(np[k] ?? "", std)).filter(Boolean);
    return parts.length ? `${parts.join("/")} ${clean(np["Power Units"] ?? "", std) || "MVA"}` : "";
  });
  const reasonRaw = pick((t) => nameplate(t)["Reason"] ?? meta(t.sections, "testSetup", "reason"));
  const instrument = [
    pick((t) => meta(t.sections, "testSetup", "acquisitionMethod")),
    pick((t) => meta(t.sections, "testEquipment", "serialNumber")),
  ].filter((v) => v && !/^\d$/.test(v));
  const ltc = pick((t) => t.setting.ltcPosition);
  const detc = pick((t) => t.setting.detcPosition);

  return {
    name: pick((t) => meta(t.sections, "apparatusLocation", "bayId")) || group.key,
    substation: pick((t) => t.location),
    manufacturer: pick((t) => nameplate(t)["Manufacturer"] ?? meta(t.sections, "transformerNameplate", "manufacturer")),
    serialNumber: group.serialNumber || "",
    year: pick((t) => nameplate(t)["Year"] ?? meta(t.sections, "transformerNameplate", "manufactureYear")),
    voltage: kv,
    power: mva,
    baselineDate: fmtSession(group.baselineSession),
    testDate: fmtSession(group.testSession),
    reason: REASONS[reasonRaw.toLowerCase()] ?? reasonRaw,
    testedBy: pick((t) => nameplate(t)["Tested By"] ?? meta(t.sections, "testSetup", "testedBy")),
    instrument: instrument.join(", "),
    tapPosition: [ltc && `OLTC: ${ltc}`, detc && `DETC: ${detc}`].filter(Boolean).join("; "),
    organization: std.report.organization ?? "",
    notes: pick((t) => meta(t.sections, "apparatusLocation", "notes")),
    decimalComma: Boolean(std.report.decimal_comma),
  };
}
