/**
 * Frequency-grid alignment (spec 5).
 * A: identical grids used as-is. B: test interpolated onto baseline frequencies (common range).
 * C: both interpolated onto a decade-anchored log grid f = 10^(k/N).
 * Linear interpolation in log10(f), values in dB, no extrapolation.
 * Phase unwrapped (radians) before interpolation, wrapped back to (-180, 180].
 */
import type { Trace } from "./types";

export type GridMode = "auto" | "A" | "B" | "C";

export const MODE_LABELS: Record<string, string> = {
  A: "A – Nguyên bản",
  B: "B – Theo lưới baseline",
  C: "C – Lưới log chuẩn",
};

export class GridMismatchError extends Error {}

export interface AlignedPair {
  freq: number[];
  xDb: number[];
  yDb: number[];
  xPhase: number[];
  yPhase: number[];
  mode: "A" | "B" | "C";
  requestedMode: GridMode;
  fLo: number;
  fHi: number;
  pointsPerDecade: number | null;
  modeLabel: string;
}

export function gridsMatch(a: number[], b: number[], rtol = 1e-6): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > rtol * Math.abs(a[i])) return false;
  return true;
}

export function wrapDeg(p: number): number {
  const m = (((180 - p) % 360) + 360) % 360;
  return 180 - m;
}

/** Linear interpolation of v(log10 f) at the target frequencies (sorted ascending). */
export function interpLog(fSrc: number[], vSrc: number[], fDst: number[]): number[] {
  const lo = fSrc[0];
  const hi = fSrc[fSrc.length - 1];
  if (fDst.length && (fDst[0] < lo * (1 - 1e-12) || fDst[fDst.length - 1] > hi * (1 + 1e-12))) {
    throw new Error("Không ngoại suy: tần số đích nằm ngoài dải tần nguồn");
  }
  const xs = fSrc.map(Math.log10);
  const out = new Array<number>(fDst.length);
  let j = 0;
  for (let i = 0; i < fDst.length; i++) {
    const x = Math.log10(fDst[i]);
    if (x <= xs[0]) {
      out[i] = vSrc[0];
      continue;
    }
    if (x >= xs[xs.length - 1]) {
      out[i] = vSrc[vSrc.length - 1];
      continue;
    }
    while (j < xs.length - 2 && xs[j + 1] < x) j++;
    while (j > 0 && xs[j] > x) j--;
    const t = (x - xs[j]) / (xs[j + 1] - xs[j]);
    out[i] = vSrc[j] + t * (vSrc[j + 1] - vSrc[j]);
  }
  return out;
}

/** numpy.unwrap equivalent for radians. */
export function unwrap(p: number[]): number[] {
  const out = p.slice();
  let offset = 0;
  for (let i = 1; i < p.length; i++) {
    const d = p[i] - p[i - 1];
    let dd = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (dd === -Math.PI && d > 0) dd = Math.PI;
    const corr = Math.abs(d) < Math.PI ? 0 : dd - d;
    offset += corr;
    out[i] = p[i] + offset;
  }
  return out;
}

export function interpPhase(fSrc: number[], pDeg: number[], fDst: number[]): number[] {
  const un = unwrap(pDeg.map((d) => (d * Math.PI) / 180));
  return interpLog(fSrc, un, fDst).map((r) => wrapDeg((r * 180) / Math.PI));
}

export function logGrid(fLo: number, fHi: number, ppd: number): number[] {
  const kLo = Math.ceil(Math.log10(fLo) * ppd - 1e-9);
  const kHi = Math.floor(Math.log10(fHi) * ppd + 1e-9);
  const out: number[] = [];
  for (let k = kLo; k <= kHi; k++) {
    const f = 10 ** (k / ppd);
    if (f >= fLo && f <= fHi) out.push(f);
  }
  return out;
}

export function align(ref: Trace, test: Trace, mode: GridMode = "auto", ppd = 200, rtol = 1e-6): AlignedPair {
  const requested = mode;
  const same = gridsMatch(ref.freq, test.freq, rtol);
  let m: "A" | "B" | "C" = mode === "auto" ? (same ? "A" : "B") : mode;
  const label = (mm: string) => MODE_LABELS[mm] + (mm === "C" ? ` ${ppd} điểm/decade` : "");

  if (m === "A") {
    if (!same) {
      throw new GridMismatchError(
        `Hai file khác lưới tần số (${ref.freq.length} và ${test.freq.length} điểm); dùng chế độ B hoặc C`,
      );
    }
    return {
      freq: ref.freq.slice(), xDb: ref.magDb.slice(), yDb: test.magDb.slice(),
      xPhase: ref.phaseDeg.slice(), yPhase: test.phaseDeg.slice(),
      mode: "A", requestedMode: requested, fLo: ref.freq[0], fHi: ref.freq[ref.freq.length - 1],
      pointsPerDecade: null, modeLabel: label("A"),
    };
  }

  const fLo = Math.max(ref.freq[0], test.freq[0]);
  const fHi = Math.min(ref.freq[ref.freq.length - 1], test.freq[test.freq.length - 1]);
  if (!(fLo < fHi)) throw new GridMismatchError("Hai file không có vùng tần số chung");

  if (m === "B") {
    const idx: number[] = [];
    ref.freq.forEach((f, i) => {
      if (f >= fLo && f <= fHi) idx.push(i);
    });
    const f = idx.map((i) => ref.freq[i]);
    return {
      freq: f, xDb: idx.map((i) => ref.magDb[i]), yDb: interpLog(test.freq, test.magDb, f),
      xPhase: idx.map((i) => ref.phaseDeg[i]), yPhase: interpPhase(test.freq, test.phaseDeg, f),
      mode: "B", requestedMode: requested, fLo: f[0], fHi: f[f.length - 1],
      pointsPerDecade: null, modeLabel: label("B"),
    };
  }

  m = "C";
  const f = logGrid(fLo, fHi, ppd);
  return {
    freq: f,
    xDb: interpLog(ref.freq, ref.magDb, f), yDb: interpLog(test.freq, test.magDb, f),
    xPhase: interpPhase(ref.freq, ref.phaseDeg, f), yPhase: interpPhase(test.freq, test.phaseDeg, f),
    mode: m, requestedMode: requested, fLo, fHi, pointsPerDecade: ppd, modeLabel: label("C"),
  };
}
