/**
 * Resonance peaks / notches and their shifts (spec 6.4). Port of scipy.signal.find_peaks
 * (local maxima with plateau midpoint, `prominence`, no wlen) as used in backend/app/core/peaks.py;
 * checked against scipy output in tests/peaks.test.ts.
 */
import type { Standards } from "./standards";

export interface Extremum {
  kind: "peak" | "notch";
  index: number;
  freq: number;
  db: number;
  prominence: number;
}

/** scipy.signal._peak_finding_utils._local_maxima_1d */
export function localMaxima(x: number[]): number[] {
  const out: number[] = [];
  let i = 1;
  const iMax = x.length - 1;
  while (i < iMax) {
    if (x[i - 1] < x[i]) {
      let ahead = i + 1;
      while (ahead < iMax && x[ahead] === x[i]) ahead++;
      if (x[ahead] < x[i]) {
        out.push(Math.floor((i + ahead - 1) / 2));
        i = ahead;
      }
    }
    i++;
  }
  return out;
}

/** scipy.signal._peak_finding_utils._peak_prominences with wlen = None */
export function prominences(x: number[], peaks: number[]): number[] {
  return peaks.map((p) => {
    let leftMin = x[p];
    for (let i = p; i >= 0 && x[i] <= x[p]; i--) if (x[i] < leftMin) leftMin = x[i];
    let rightMin = x[p];
    for (let i = p; i < x.length && x[i] <= x[p]; i++) if (x[i] < rightMin) rightMin = x[i];
    return x[p] - Math.max(leftMin, rightMin);
  });
}

export function findPeaks(x: number[], minProminence: number): { index: number; prominence: number }[] {
  const pk = localMaxima(x);
  const pr = prominences(x, pk);
  return pk.map((index, k) => ({ index, prominence: pr[k] })).filter((p) => p.prominence >= minProminence);
}

export function findExtrema(freq: number[], db: number[], minProminence: number): Extremum[] {
  const out: Extremum[] = [];
  for (const [kind, sig] of [["peak", db], ["notch", db.map((v) => -v)]] as const) {
    for (const p of findPeaks(sig as number[], minProminence)) {
      out.push({ kind, index: p.index, freq: freq[p.index], db: db[p.index], prominence: p.prominence });
    }
  }
  return out.sort((a, b) => a.freq - b.freq);
}

export type MatchStatus = "ok" | "warning" | "alarm" | "lost" | "new";

export interface PeakMatch {
  kind: "peak" | "notch";
  ref: Extremum | null;
  test: Extremum | null;
  /** (f_test − f_ref) / f_ref · 100 */
  shiftPercent: number | null;
  deltaHz: number | null;
  deltaDb: number | null;
  status: MatchStatus;
  /** DL/T 911 band of the extremum, or "<1 kHz" / ">1 MHz" */
  band: string;
}

export interface PeakAnalysis {
  ref: Extremum[];
  test: Extremum[];
  matches: PeakMatch[];
  fLo: number;
  fHi: number;
  prominence: number;
  window: number;
}

function bandOf(f: number, std: Standards): string {
  for (const [k, b] of Object.entries(std.dlt911.bands)) {
    const lo = b.include_min ? f >= b.f_min : f > b.f_min;
    const hi = b.include_max ? f <= b.f_max : f < b.f_max;
    if (lo && hi) return k;
  }
  const first = Object.values(std.dlt911.bands)[0];
  return f < first.f_min ? "<1 kHz" : ">1 MHz";
}

export function matchExtrema(ref: Extremum[], test: Extremum[], window: number, std: Standards): PeakMatch[] {
  const th = std.peaks.shift_thresholds_percent;
  const out: PeakMatch[] = [];
  for (const kind of ["peak", "notch"] as const) {
    const r = ref.filter((e) => e.kind === kind);
    const t = test.filter((e) => e.kind === kind);
    const cand: [number, number, number][] = [];
    r.forEach((a, i) =>
      t.forEach((b, j) => {
        if (Math.abs(b.freq / a.freq - 1) <= window) cand.push([Math.abs(Math.log10(b.freq / a.freq)), i, j]);
      }),
    );
    cand.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    const ur = new Set<number>();
    const ut = new Set<number>();
    for (const [, i, j] of cand) {
      if (ur.has(i) || ut.has(j)) continue;
      ur.add(i);
      ut.add(j);
      const a = r[i];
      const b = t[j];
      const shift = ((b.freq - a.freq) / a.freq) * 100;
      const abs = Math.abs(shift);
      out.push({
        kind, ref: a, test: b, shiftPercent: shift, deltaHz: b.freq - a.freq, deltaDb: b.db - a.db,
        status: abs >= th.alarm ? "alarm" : abs >= th.warning ? "warning" : "ok", band: bandOf(a.freq, std),
      });
    }
    r.forEach((a, i) => {
      if (!ur.has(i)) out.push({ kind, ref: a, test: null, shiftPercent: null, deltaHz: null, deltaDb: null, status: "lost", band: bandOf(a.freq, std) });
    });
    t.forEach((b, j) => {
      if (!ut.has(j)) out.push({ kind, ref: null, test: b, shiftPercent: null, deltaHz: null, deltaDb: null, status: "new", band: bandOf(b.freq, std) });
    });
  }
  return out.sort((p, q) => (p.ref ?? p.test)!.freq - (q.ref ?? q.test)!.freq);
}

/** Extrema of each trace inside the common frequency range, then matched. */
export function analyzePeaks(
  ref: { freq: number[]; magDb: number[] }, test: { freq: number[]; magDb: number[] }, std: Standards,
): PeakAnalysis {
  const fLo = Math.max(ref.freq[0], test.freq[0]);
  const fHi = Math.min(ref.freq[ref.freq.length - 1], test.freq[test.freq.length - 1]);
  const prom = std.peaks.prominence_db as number;
  const win = std.peaks.match_window_ratio as number;
  const inRange = (e: Extremum) => e.freq >= fLo && e.freq <= fHi;
  const r = findExtrema(ref.freq, ref.magDb, prom).filter(inRange);
  const t = findExtrema(test.freq, test.magDb, prom).filter(inRange);
  return { ref: r, test: t, matches: matchExtrema(r, t, win, std), fLo, fHi, prominence: prom, window: win };
}

export function peakStatusLabel(s: MatchStatus, std: Standards): string {
  const th = std.peaks.shift_thresholds_percent;
  return (std.peaks.labels[s] as string).replace("{warning}", String(th.warning)).replace("{alarm}", String(th.alarm));
}

export interface PeakCount {
  /** DL/T 911 band key, or "outside" for extrema outside the bands */
  band: string;
  peaksNew: number;
  peaksLost: number;
  notchesNew: number;
  notchesLost: number;
}

/** New and lost peaks / notches per DL/T 911 band, then outside the bands. */
export function peakCounts(pa: PeakAnalysis, std: Standards): PeakCount[] {
  const bands = [...Object.keys(std.dlt911.bands), "outside"];
  const of = (m: PeakMatch) => (bands.includes(m.band) ? m.band : "outside");
  return bands.map((band) => {
    const ms = pa.matches.filter((m) => of(m) === band);
    const n = (kind: PeakMatch["kind"], status: MatchStatus) => ms.filter((m) => m.kind === kind && m.status === status).length;
    return { band, peaksNew: n("peak", "new"), peaksLost: n("peak", "lost"), notchesNew: n("notch", "new"), notchesLost: n("notch", "lost") };
  });
}
