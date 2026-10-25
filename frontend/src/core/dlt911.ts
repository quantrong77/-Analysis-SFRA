/** DL/T 911-2004, Appendix A: relative factor Rxy per band and Table A.1 classification (spec 6.1). */
import type { BandCfg, LevelCfg, Standards } from "./standards";

export interface BandResult {
  band: string;
  label: string;
  f_min: number;
  f_max: number;
  include_min: boolean;
  include_max: boolean;
  threshold: number;
  source: string;
  n: number;
  xMean: number | null;
  yMean: number | null;
  dx: number | null;
  dy: number | null;
  cxy: number | null;
  lrxy: number | null;
  rxy: number | null;
  note: string;
}

export interface RelativeFactor {
  n: number;
  xMean: number | null;
  yMean: number | null;
  dx: number | null;
  dy: number | null;
  cxy: number | null;
  lrxy: number | null;
  rxy: number | null;
  note: string;
}

/** A.1–A.4 on two equal-length dB sequences X (baseline), Y (test). */
export function relativeFactor(x: number[], y: number[], rxyMax = 10, eps = 1e-10): RelativeFactor {
  const n = x.length;
  const out: RelativeFactor = { n, xMean: null, yMean: null, dx: null, dy: null, cxy: null, lrxy: null, rxy: null, note: "" };
  if (n < 2) {
    out.note = "Ít hơn 2 điểm trong dải";
    return out;
  }
  let sx = 0;
  let sy = 0;
  for (let k = 0; k < n; k++) {
    sx += x[k];
    sy += y[k];
  }
  const xMean = sx / n;
  const yMean = sy / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let k = 0; k < n; k++) {
    const a = x[k] - xMean;
    const b = y[k] - yMean;
    sxx += a * a;
    syy += b * b;
    sxy += a * b;
  }
  const dx = sxx / n;
  const dy = syy / n;
  const cxy = sxy / n;
  Object.assign(out, { xMean, yMean, dx, dy, cxy });
  if (dx <= 0 || dy <= 0) {
    out.note = "Phương sai bằng 0, không tính được LRxy";
    return out;
  }
  const lrxy = cxy / Math.sqrt(dx * dy);
  out.lrxy = lrxy;
  out.rxy = 1 - lrxy < eps ? rxyMax : -Math.log10(1 - lrxy);
  return out;
}

export function inBand(f: number, cfg: BandCfg): boolean {
  const lo = cfg.include_min ?? true ? f >= cfg.f_min : f > cfg.f_min;
  const hi = cfg.include_max ?? true ? f <= cfg.f_max : f < cfg.f_max;
  return lo && hi;
}

export function computeBands(freq: number[], x: number[], y: number[], std: Standards): Record<string, BandResult> {
  const d = std.dlt911;
  const out: Record<string, BandResult> = {};
  for (const [name, cfg] of Object.entries(d.bands)) {
    const xs: number[] = [];
    const ys: number[] = [];
    freq.forEach((f, i) => {
      if (inBand(f, cfg)) {
        xs.push(x[i]);
        ys.push(y[i]);
      }
    });
    const rf = relativeFactor(xs, ys, d.rxy_max, d.rxy_eps);
    out[name] = {
      band: name,
      label: cfg.label,
      f_min: cfg.f_min,
      f_max: cfg.f_max,
      include_min: cfg.include_min ?? true,
      include_max: cfg.include_max ?? true,
      threshold: cfg.threshold,
      source: cfg.source,
      ...rf,
    };
  }
  return out;
}

export interface Classification {
  id: string;
  label: string;
  label_en: string;
  rank: number;
  in_standard: boolean;
  source: string;
  note: string;
}

const OPS: Record<string, (v: number, t: number) => boolean> = {
  lt: (v, t) => v < t,
  le: (v, t) => v <= t,
  gt: (v, t) => v > t,
  ge: (v, t) => v >= t,
};

function clauseHolds(clause: Record<string, Record<string, number>>, values: Record<string, number>): boolean {
  return Object.entries(clause).every(([name, conds]) =>
    Object.entries(conds).every(([op, t]) => OPS[op](values[name], t)),
  );
}

function toClassification(level: LevelCfg, defaultSource: string): Classification {
  return {
    id: level.id,
    label: level.label,
    label_en: level.label_en,
    rank: level.rank,
    in_standard: level.in_standard,
    source: level.source ?? defaultSource,
    note: level.note ?? "",
  };
}

/** Table A.1, checked from most to least severe; the first matching level wins. Values keyed LF/MF/HF. */
export function classify(values: Record<string, number | null>, std: Standards): Classification {
  const c = std.dlt911.classification;
  if (Object.keys(std.dlt911.bands).some((b) => values[b] === null || values[b] === undefined)) {
    return toClassification(c.insufficient, c.source);
  }
  const named: Record<string, number> = {};
  for (const [b, v] of Object.entries(values)) named[`R${b}`] = v as number;
  for (const level of c.levels) {
    if ((level.any ?? []).some((cl) => clauseHolds(cl, named))) return toClassification(level, c.source);
  }
  throw new Error(`Không mức nào khớp với ${JSON.stringify(values)}; kiểm tra lại standards.yaml`);
}

export function actionFor(levelId: string, std: Standards): string {
  return std.actions.by_level[levelId] ?? "";
}
