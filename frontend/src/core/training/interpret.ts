/**
 * Reading a real baseline / test pair against the failure modes of IEEE Std C57.149-2012 6.5:
 * what changed in each frequency band of Tables 7–13, then which failure modes describe that
 * pattern for the measurement type (open or short circuit). A reference aid for the analyst: the
 * standard itself says the bands are approximate and that the same damage shows differently on
 * different designs.
 */
import type { PairResult } from "../analysis";
import { measurementConfig } from "../pairing";
import type { Standards } from "../standards";
import { TRAINING, type FaultInfo, type FeatureId, type RegionState } from "./content";

export interface RegionObs {
  id: string;
  label: string;
  /** points of the common grid inside the band */
  n: number;
  /** 90th percentile and maximum of |ΔdB| inside the band */
  p90: number | null;
  max: number | null;
  /** resonances of the band whose frequency moved past the alarm threshold, and that disappeared or appeared */
  shifted: number;
  lost: number;
  added: number;
  state: RegionState | "no_data";
  /** what made the band count as changed */
  why: string[];
}

export interface Candidate {
  fault: FaultInfo;
  /** (agreeing − disagreeing weight) / weight checked, −1 … 1 */
  score: number;
  /** agreeing weight: breaks ties in favour of the mode with more matching evidence */
  support: number;
  /** points that agree / disagree with the source table */
  agree: string[];
  disagree: string[];
}

export interface Interpretation {
  test: "open" | "short";
  regions: RegionObs[];
  /** features found in the pair, with the reading that shows them */
  features: Partial<Record<FeatureId, string>>;
  candidates: Candidate[];
  /** why the pair is not matched against the failure modes (measurement type the tables do not cover) */
  skipped: string | null;
  /** open circuit with only the core band changed: residual magnetization to be ruled out first */
  coreOnly: boolean;
}

const p90 = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.9 * (s.length - 1)))];
};

/** Open circuit unless a winding was shorted during the measurement (pairing.measurementConfig) */
export const testKind = (r: PairResult): "open" | "short" => (measurementConfig(r.test) === "open" ? "open" : "short");

export function observeRegions(r: PairResult, std: Standards): RegionObs[] {
  const cfg = std.interpretation ?? {};
  const thr = (cfg.db_p90_changed as number) ?? 3;
  const flagged = new Set<string>((cfg.changed_peak_status as string[]) ?? ["alarm", "lost", "new"]);
  const a = r.aligned;
  return TRAINING.bands.map((b) => {
    const diffs: number[] = [];
    a.freq.forEach((f, i) => {
      if (f >= b.f_min && f <= b.f_max) diffs.push(Math.abs(a.yDb[i] - a.xDb[i]));
    });
    const inBand = (f: number | undefined) => f !== undefined && f >= b.f_min && f <= b.f_max;
    let shifted = 0;
    let lost = 0;
    let added = 0;
    for (const m of r.peaks.matches) {
      if (!flagged.has(m.status) || !inBand(m.ref?.freq ?? m.test?.freq)) continue;
      if (m.status === "lost") lost++;
      else if (m.status === "new") added++;
      else shifted++;
    }
    const q = p90(diffs);
    const why: string[] = [];
    if (q !== null && q >= thr) why.push(`|ΔdB| phân vị 90 = ${q.toFixed(1)} dB ≥ ${thr} dB`);
    if (shifted) why.push(`${shifted} cộng hưởng dịch mạnh`);
    if (lost) why.push(`${lost} cộng hưởng mất`);
    if (added) why.push(`${added} cộng hưởng mới`);
    return {
      id: b.id, label: b.label, n: diffs.length, p90: q, max: diffs.length ? Math.max(...diffs) : null,
      shifted, lost, added, why,
      state: diffs.length < 5 ? "no_data" : why.length ? "changed" : "unchanged",
    };
  });
}

const meanDiff = (r: PairResult, lo: number, hi: number): number | null => {
  const a = r.aligned;
  const d: number[] = [];
  a.freq.forEach((f, i) => {
    if (f >= lo && f <= hi) d.push(a.yDb[i] - a.xDb[i]);
  });
  return d.length ? d.reduce((x, y) => x + y, 0) / d.length : null;
};

/** Features of the failure-mode descriptions that the band states alone do not tell (thresholds in standards.yaml) */
function features(r: PairResult, std: Standards, test: "open" | "short"): Interpretation["features"] {
  const cfg = std.interpretation ?? {};
  const out: Interpretation["features"] = {};
  if (test === "open") {
    // core resonance: the lowest notch below 5 kHz (IEEE 6.5.9)
    const lowest = (xs: { freq: number; kind: string }[]) => xs.filter((e) => e.kind === "notch" && e.freq < 5e3).sort((a, b) => a.freq - b.freq)[0];
    const a = lowest(r.peaks.ref);
    const b = lowest(r.peaks.test);
    const min = (cfg.core_shift_up_percent as number) ?? 5;
    if (a && b && ((b.freq - a.freq) / a.freq) * 100 >= min) {
      out.core_shift_up = `cộng hưởng lõi dịch sang phải ${(((b.freq - a.freq) / a.freq) * 100).toFixed(1)} % (${Math.round(a.freq)} → ${Math.round(b.freq)} Hz)`;
    }
    const lf = meanDiff(r, 20, 200);
    if (lf !== null && lf >= ((cfg.lf_rise_db as number) ?? 6)) out.lf_rise = `vùng 20–200 Hz cao hơn trung bình ${lf.toFixed(1)} dB, đường hở mạch như bị tải`;
  }
  const wide = meanDiff(r, 20, 1e5);
  if (wide !== null && wide <= -((cfg.broad_drop_db as number) ?? 6)) out.broad_drop = `20 Hz – 100 kHz thấp hơn trung bình ${(-wide).toFixed(1)} dB`;
  return out;
}

const FEATURE_TEXT: Record<FeatureId, string> = {
  core_shift_up: "cộng hưởng lõi dịch sang phải",
  lf_rise: "vùng thấp của phép đo hở mạch tăng như đường ngắn mạch",
  broad_drop: "đáp ứng tụt trên dải rộng",
};

const STATE_TEXT: Record<RegionState, string> = { changed: "có thay đổi", unchanged: "không đổi" };

export function interpret(r: PairResult, std: Standards): Interpretation {
  const test = testKind(r);
  const regions = observeRegions(r, std);
  const cfg = std.interpretation ?? {};
  const changed = (id: string) => regions.find((x) => x.id === id)?.state === "changed";
  const coreOnly = test === "open" && changed("r1") && !["r2", "r3", "r4"].some(changed);
  if (((cfg.skip_groups as string[]) ?? []).includes(r.group.id)) {
    return { test, regions, features: {}, candidates: [], skipped: (cfg.skip_note as string) ?? "Không đối chiếu loại phép đo này.", coreOnly: false };
  }
  const found = features(r, std, test);
  const byId = new Map(regions.map((x) => [x.id, x]));
  const kind = test === "open" ? "hở mạch" : "ngắn mạch";
  const candidates: Candidate[] = [];
  for (const f of TRAINING.faults) {
    const want = f.signature?.[test];
    if (!f.signature || !want) continue;
    let plus = 0;
    let minus = 0;
    // evidence of a change that the table describes: without one, a mode is not proposed
    let evidence = f.id === "none";
    const agree: string[] = [];
    const disagree: string[] = [];
    for (const [band, expected] of Object.entries(want)) {
      const got = byId.get(band);
      if (!got || got.state === "no_data") continue;
      const weight = band === f.signature.primary ? 2 : 1;
      const text = `${got.label}: đo ${kind} ${STATE_TEXT[got.state]}, bảng ghi ${STATE_TEXT[expected]}${weight === 2 ? " (dải rõ nhất)" : ""}`;
      if (got.state === expected) {
        plus += weight;
        agree.push(text);
        if (expected === "changed") evidence = true;
      } else {
        minus += weight;
        disagree.push(text);
      }
    }
    for (const ft of f.signature.features ?? []) {
      const seen = found[ft.id];
      if (seen) {
        plus += 2;
        evidence = true;
        agree.push(seen.charAt(0).toUpperCase() + seen.slice(1));
      } else if (ft.required) {
        minus += 2;
        disagree.push(`Không thấy dấu hiệu: ${FEATURE_TEXT[ft.id]}`);
      }
    }
    if (!evidence || plus + minus === 0) continue;
    candidates.push({ fault: f, score: (plus - minus) / (plus + minus), support: plus, agree, disagree });
  }
  candidates.sort((a, b) => b.score - a.score || b.support - a.support);
  return { test, regions, features: found, candidates, skipped: null, coreOnly };
}

/** Candidates worth showing: those that agree more than they disagree, best first */
export const likely = (it: Interpretation, max = 3): Candidate[] => it.candidates.filter((c) => c.score > 0).slice(0, max);

/** One line for tables: the bands that changed, then the failure modes they fit best */
export function hint(it: Interpretation): string {
  if (it.skipped) return "Không đối chiếu (đo giữa các cuộn dây)";
  const changed = it.regions.filter((x) => x.state === "changed").map((x) => x.label.replace(/ \(.*\)$/, ""));
  if (!changed.length) return "Không vùng nào thay đổi rõ";
  if (it.coreOnly) return "Chỉ vùng lõi thay đổi: loại trừ từ dư trước";
  const top = likely(it, 2).filter((c) => c.fault.id !== "none");
  return `Thay đổi: ${changed.join(", ")}. ${top.length ? `Phù hợp: ${top.map((c) => c.fault.label).join("; ")}` : "Chưa khớp dạng nào"}`;
}
