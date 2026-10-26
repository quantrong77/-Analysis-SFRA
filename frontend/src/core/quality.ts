/** Data-quality checks at import (spec 4.3). They warn, never block. Mirrors backend/app/core/quality.py. */
import { inBand } from "./dlt911";
import type { Standards } from "./standards";
import type { TestSetting, Trace } from "./types";

export interface QualityWarning {
  code: string;
  severity: "warning" | "note";
  message: string;
  source: string;
}

/** Frequency with unit, Vietnamese decimal comma (e.g. "1,989 MHz"). */
/** Round band edges without trailing zeros: "1 kHz", "600 kHz", "1 MHz". */
export const fmtHzShort = (f: number): string =>
  (f >= 1e6 ? `${f / 1e6} MHz` : f >= 1e3 ? `${f / 1e3} kHz` : `${f} Hz`).replace(".", ",");

export function fmtHz(f: number): string {
  const s = f >= 1e6 ? `${(f / 1e6).toFixed(3)} MHz` : f >= 1e3 ? `${(f / 1e3).toFixed(3)} kHz` : `${f.toFixed(3)} Hz`;
  return s.replace(".", ",");
}

const maxStep = (a: number[]) => a.slice(1).reduce((m, v, i) => Math.max(m, v - a[i]), 0);

export function checkTrace(t: Trace, std: Standards, umKv: number | null = null): QualityWarning[] {
  const q = std.quality;
  const out: QualityWarning[] = [];
  const f = t.freq;
  const fMin = f[0];
  const fMax = f[f.length - 1];

  let c = q.fmax;
  const low = umKv !== null && umKv > 0 && umKv <= c.um_threshold_kv;
  const need = low ? c.min_fmax_hz_um_below : c.min_fmax_hz_um_above;
  const cond = low ? `Um ≤ ${c.um_threshold_kv} kV` : `Um > ${c.um_threshold_kv} kV`;
  if (fMax < need) {
    out.push({ code: "fmax_low", severity: "warning", source: c.source,
      message: `Tần số cao nhất ${fmtHz(fMax)} nhỏ hơn yêu cầu ${fmtHz(need)} (${cond})` });
  }

  c = q.density;
  const lim = c.low_freq_limit_hz;
  const lowF = f.filter((v) => v <= lim);
  if (lowF.length >= 2) {
    const step = maxStep(lowF);
    if (step > c.max_step_below_limit_hz) {
      out.push({ code: "density_low_freq", severity: "warning", source: c.source,
        message: `Dưới ${lim} Hz bước quét lớn nhất ${step.toFixed(3)} Hz > ${c.max_step_below_limit_hz} Hz` });
    }
  }
  let k = Math.ceil(Math.log10(Math.max(lim, fMin)) - 1e-12);
  while (10 ** (k + 1) <= fMax * (1 + 1e-12)) {
    const lo = 10 ** k;
    const hi = 10 ** (k + 1);
    const cnt = f.filter((v) => v >= lo && v < hi).length;
    if (cnt < c.min_points_per_decade) {
      out.push({ code: "density_decade", severity: "warning", source: c.source,
        message: `Decade ${fmtHz(lo)}–${fmtHz(hi)} có ${cnt} điểm < ${c.min_points_per_decade} điểm/decade` });
    }
    k++;
  }

  c = q.dlt911_step;
  const seg = f.filter((v) => v >= c.f_min && v <= c.f_max);
  if (seg.length >= 2) {
    const step = maxStep(seg);
    if (step > c.max_step_hz) {
      out.push({ code: "dlt911_step", severity: c.severity ?? "note", source: c.source,
        message: `Bước quét lớn nhất trong 1 kHz–1 MHz là ${fmtHz(step)} > ${fmtHz(c.max_step_hz)}. ${c.note}` });
    }
  }

  c = q.coverage;
  if (fMin > c.f_min || fMax < c.f_max) {
    out.push({ code: "coverage", severity: "warning", source: c.source,
      message: `Dải tần đo ${fmtHz(fMin)}–${fmtHz(fMax)} không phủ ${fmtHz(c.f_min)}–${fmtHz(c.f_max)}` });
  }
  for (const [name, b] of Object.entries(std.dlt911.bands)) {
    if (f.filter((v) => inBand(v, b)).length < 2) {
      out.push({ code: `band_missing_${name}`, severity: "warning", source: b.source,
        message: `Thiếu dữ liệu dải ${name} (${b.label})` });
    }
  }
  return out;
}

const norm = (s: string) => s.split(/\s+/).filter(Boolean).join(" ").toLocaleLowerCase("vi");

/** Case-sensitive: 'A' (HV) and 'a' (LV) are different terminals. */
function terminal(s: string, aliases: Record<string, string>): string {
  const v = s.trim();
  return aliases[v] ?? v;
}

function terminalList(s: string, aliases: Record<string, string>): string {
  const parts = s.split("-").map((p) => p.trim());
  if (parts.length > 1 && parts.every(Boolean)) return parts.map((p) => terminal(p, aliases)).join("-");
  return norm(terminal(s, aliases));
}

function value(s: string, groups: string[][]): string {
  const v = norm(s);
  for (const g of groups) if (g.map(norm).includes(v)) return norm(g[0]);
  return v;
}

export function checkPair(ref: Trace, test: Trace, std: Standards): QualityWarning[] {
  const c = std.quality.pair;
  const aliases: Record<string, string> = c.terminal_aliases?.map ?? {};
  const groups: string[][] = c.value_equivalents?.groups ?? [];
  const out: QualityWarning[] = [];
  const rs = ref.setting;
  const ts = test.setting;
  if (rs.redLead || rs.blackLead) {
    const [rr, rb, tr, tb] = [rs.redLead, rs.blackLead, ts.redLead, ts.blackLead].map((x) => terminal(x, aliases));
    const same = rr === tr && rb === tb;
    const swapped = rr === tb && rb === tr;
    const desc = `(baseline ${rs.redLead}→${rs.blackLead}, lần đo ${ts.redLead}→${ts.blackLead})`;
    if (swapped && !same) {
      out.push({ code: "reversed_leads", severity: "warning", source: c.source, message: `Đầu đo đảo so với baseline ${desc}` });
    } else if (!same) {
      out.push({ code: "different_leads", severity: "warning", source: c.source, message: `Đầu đo khác baseline ${desc}` });
    }
  }
  const fieldMap: Record<string, keyof TestSetting> = {
    measurement_type: "measurementType",
    shorted_terminal: "shortedTerminal",
    grounded_terminal: "groundedTerminal",
    ltc_position: "ltcPosition",
    detc_position: "detcPosition",
  };
  for (const [attr, label] of Object.entries(c.compare_fields as Record<string, string>)) {
    const key = fieldMap[attr];
    const a = rs[key];
    const b = ts[key];
    const differ = attr === "shorted_terminal" || attr === "grounded_terminal"
      ? terminalList(a, aliases) !== terminalList(b, aliases)
      : value(a, groups) !== value(b, groups);
    if (differ) {
      out.push({ code: `diff_${attr}`, severity: "warning", source: c.source,
        message: `${label} khác baseline (baseline "${a}", lần đo "${b}")` });
    }
  }
  return out;
}
