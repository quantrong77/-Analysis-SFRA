/** One baseline/test pair: align grids, DL/T 911 bands, classification, warnings, TB 812 indices, peaks. */
import { actionFor, classify, computeBands, inBand, relativeFactor, type BandResult, type Classification } from "./dlt911";
import { tb812Indices, type Tb812 } from "./indices";
import { analyzePeaks, type PeakAnalysis } from "./peaks";
import { checkPair, checkTrace, type QualityWarning } from "./quality";
import { align, type AlignedPair, type GridMode } from "./resample";
import type { BandCfg, Standards } from "./standards";
import type { Trace } from "./types";

export interface RangeIndices {
  key: string;
  label: string;
  f_min: number;
  f_max: number;
  n: number;
  /** DL/T 911 Rxy on this range (shown for IEC zones, no threshold) */
  rxy: number | null;
  tb812: Tb812;
}

export interface PairResult {
  index: number | null;
  label: string;
  group: { id: string; label: string };
  baseline: Trace;
  test: Trace;
  aligned: AlignedPair;
  bands: Record<string, BandResult>;
  classification: Classification;
  action: string;
  warnings: QualityWarning[];
  rulesetVersion: string;
  /** CIGRE TB 812 indices per DL/T 911 band and per IEC 60076-18 zone (spec 6.2, 6.3) */
  tb812Bands: RangeIndices[];
  tb812Zones: RangeIndices[];
  /** Resonance peaks / notches (spec 6.4) */
  peaks: PeakAnalysis;
}

export function measurementGroup(label: string, std: Standards): { id: string; label: string } {
  const g = std.measurement_groups;
  for (const it of g.groups as { id: string; label: string; pattern: string }[]) {
    if (new RegExp(it.pattern).test(label)) return { id: it.id, label: it.label };
  }
  return g.other;
}

export function rangeIndices(
  a: { freq: number[]; xDb: number[]; yDb: number[] }, key: string, label: string, cfg: Pick<BandCfg, "f_min" | "f_max"> & Partial<BandCfg>,
  std: Standards,
): RangeIndices {
  const x: number[] = [];
  const y: number[] = [];
  const band = { include_min: true, include_max: false, ...cfg } as BandCfg;
  a.freq.forEach((f, i) => {
    if (inBand(f, band)) {
      x.push(a.xDb[i]);
      y.push(a.yDb[i]);
    }
  });
  return {
    key, label, f_min: cfg.f_min, f_max: cfg.f_max, n: x.length,
    rxy: relativeFactor(x, y, std.dlt911.rxy_max, std.dlt911.rxy_eps).rxy, tb812: tb812Indices(x, y),
  };
}

/** TB 812 indices and Rxy for DL/T bands and IEC zones; used by baseline pairs and reference comparisons. */
export function indicesFor(a: { freq: number[]; xDb: number[]; yDb: number[] }, std: Standards) {
  return {
    bands: Object.entries(std.dlt911.bands).map(([k, b]) => rangeIndices(a, k, b.label, b, std)),
    zones: Object.entries(std.iec_zones.zones as Record<string, { label: string; f_min: number; f_max: number }>).map(([k, z]) =>
      rangeIndices(a, k, z.label, { f_min: z.f_min, f_max: z.f_max === Infinity ? Number.MAX_VALUE : z.f_max }, std),
    ),
  };
}

export function analyzePair(
  ref: Trace, test: Trace, std: Standards,
  opts: { mode?: GridMode; index?: number | null; label?: string; umKv?: number | null } = {},
): PairResult {
  const r = std.resample;
  const aligned = align(ref, test, opts.mode ?? r.default_mode, r.log_grid_points_per_decade, r.grid_match_rtol);
  const bands = computeBands(aligned.freq, aligned.xDb, aligned.yDb, std);
  const values = Object.fromEntries(Object.entries(bands).map(([k, b]) => [k, b.rxy]));
  const cls = classify(values, std);
  const label = opts.label ?? test.label;
  const idx = indicesFor(aligned, std);
  return {
    index: opts.index ?? test.index, label, group: measurementGroup(test.label, std),
    baseline: ref, test, aligned, bands, classification: cls, action: actionFor(cls.id, std),
    warnings: [...checkPair(ref, test, std), ...checkTrace(test, std, opts.umKv ?? null)],
    rulesetVersion: std.versionTag,
    tb812Bands: idx.bands, tb812Zones: idx.zones,
    peaks: analyzePeaks(ref, test, std),
  };
}
