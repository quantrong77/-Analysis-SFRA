/**
 * Transfer-function lab: a sine V_in at one frequency goes through a linear network and comes out as
 * a sine of the same frequency, scaled by |H(f)| and shifted by arg H(f). The SFRA plot is these two
 * numbers over the swept range (amplitude in dB, phase in degrees). Everything here is linear-circuit
 * arithmetic on the teaching ladder model and on a first-order R–L example.
 */
import { HEALTHY, logFreq, noScale, response } from "./ladder";

export type LabCircuit = "rl" | "open" | "short";

export interface Sweep {
  freq: number[];
  magDb: number[];
  phaseDeg: number[];
}

export const LAB_F0 = 20;
export const LAB_F1 = 2e6;
export const LAB_FREQ = logFreq(LAB_F0, LAB_F1, 100);

/** Series inductance and resistance of the R–L example, feeding the 50 Ω response impedance */
export const RL = { L: 10e-3, R: 5, load: 50 };
/** Corner frequency of the R–L example, where |H| is 3 dB below its low-frequency value */
export const rlCorner = () => (RL.R + RL.load) / (2 * Math.PI * RL.L);

export function sweep(circuit: LabCircuit, freq = LAB_FREQ): Sweep {
  if (circuit !== "rl") {
    const r = response(HEALTHY, noScale(HEALTHY.n), circuit, freq);
    return { freq, ...r };
  }
  const magDb: number[] = [];
  const phaseDeg: number[] = [];
  for (const f of freq) {
    // H = Rload / (R + Rload + jωL)
    const re = RL.R + RL.load;
    const im = 2 * Math.PI * f * RL.L;
    magDb.push(20 * Math.log10(RL.load / Math.hypot(re, im)));
    phaseDeg.push((-Math.atan2(im, re) * 180) / Math.PI);
  }
  return { freq, magDb, phaseDeg };
}

/** Position 0…1 on the log frequency axis of the lab, and back */
export const toU = (f: number) => Math.log10(f / LAB_F0) / Math.log10(LAB_F1 / LAB_F0);
export const fromU = (u: number) => LAB_F0 * (LAB_F1 / LAB_F0) ** Math.min(1, Math.max(0, u));

/** Index of the sweep point nearest to f on the log axis */
export function nearest(s: Sweep, f: number): number {
  const u = toU(f);
  const i = Math.round(u * (s.freq.length - 1));
  return Math.min(s.freq.length - 1, Math.max(0, i));
}

const span = (s: Sweep) => Math.max(1, Math.round(((s.freq.length - 1) / Math.log10(LAB_F1 / LAB_F0)) * 0.1));

/**
 * Local minima (notches) and maxima (peaks) of the amplitude that stand at least 3 dB clear of the
 * curve on both sides within ±0.4 decade: resonances, not ripples.
 */
export function turningPoints(s: Sweep): { kind: "min" | "max"; f: number; depth: number }[] {
  const n = s.freq.length;
  const wide = 4 * span(s);
  const out: { kind: "min" | "max"; f: number; depth: number }[] = [];
  for (let j = 1; j < n - 1; j++) {
    const m = s.magDb[j];
    const isMin = m < s.magDb[j - 1] && m <= s.magDb[j + 1];
    const isMax = m > s.magDb[j - 1] && m >= s.magDb[j + 1];
    if (!isMin && !isMax) continue;
    const left = s.magDb.slice(Math.max(0, j - wide), j);
    const right = s.magDb.slice(j + 1, Math.min(n, j + wide + 1));
    if (!left.length || !right.length) continue;
    const depth = isMin
      ? Math.min(Math.max(...left), Math.max(...right)) - m
      : m - Math.max(Math.min(...left), Math.min(...right));
    if (depth >= 3) out.push({ kind: isMin ? "min" : "max", f: s.freq[j], depth });
  }
  return out;
}

/** What the response does at one frequency */
export interface Reading {
  f: number;
  magDb: number;
  /** |V_out| / |V_in| */
  ratio: number;
  phaseDeg: number;
  /** delay of V_out behind V_in, s; negative when V_out leads */
  delay: number;
  /** slope of the amplitude, dB per decade, over ±0.1 decade */
  slope: number;
  /** a local minimum or maximum of the amplitude within ±0.2 decade, with its frequency */
  extremum: { kind: "min" | "max"; f: number; depth: number } | null;
  /** phase change over ±0.1 decade, degrees */
  phaseSwing: number;
}

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export function readAt(s: Sweep, f: number): Reading {
  const n = s.freq.length;
  const i = nearest(s, f);
  const k = span(s);
  const lo = Math.max(0, i - k);
  const hi = Math.min(n - 1, i + k);
  const slope = (s.magDb[hi] - s.magDb[lo]) / Math.log10(s.freq[hi] / s.freq[lo]);
  let swing = 0;
  for (let j = lo; j < hi; j++) swing += Math.abs(wrap(s.phaseDeg[j + 1] - s.phaseDeg[j]));

  // a turning point of the amplitude close by: ±0.2 decade, the flanks of a sharp resonance included
  let extremum: Reading["extremum"] = null;
  for (const t of turningPoints(s)) {
    const j = nearest(s, t.f);
    if (Math.abs(j - i) <= 2 * k && (!extremum || Math.abs(j - i) < Math.abs(nearest(s, extremum.f) - i))) extremum = t;
  }
  const phaseDeg = s.phaseDeg[i];
  const fi = s.freq[i];
  return {
    f: fi,
    magDb: s.magDb[i],
    ratio: 10 ** (s.magDb[i] / 20),
    phaseDeg,
    delay: -phaseDeg / 360 / fi,
    slope,
    extremum,
    phaseSwing: swing,
  };
}

/** Plain-language reading of the phase: which element dominates the path from V_in to V_out */
export function phaseText(phaseDeg: number): { tone: "lag" | "lead" | "flat"; text: string } {
  if (phaseDeg <= -30)
    return {
      tone: "lag",
      text: "Vout trễ pha so với Vin: đường đi của tín hiệu mang tính cảm (điện cảm chiếm ưu thế), giống một cuộn cảm nối tiếp với điện trở 50 Ω.",
    };
  if (phaseDeg >= 30)
    return {
      tone: "lead",
      text: "Vout sớm pha so với Vin: đường đi của tín hiệu mang tính dung (điện dung chiếm ưu thế), giống một tụ nối tiếp với điện trở 50 Ω.",
    };
  return {
    tone: "flat",
    text: "Vout gần như cùng pha với Vin: phần cảm và phần dung bù trừ nhau, mạch gần như thuần trở ở tần số này.",
  };
}
