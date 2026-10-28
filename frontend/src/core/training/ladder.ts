/**
 * Lumped-parameter ladder network of one transformer winding, for teaching (IEEE Std C57.149-2012,
 * 6.6 and Annex A: n-stage ladder of series inductance L with series capacitance Cs, shunt
 * capacitance Cg to ground, losses as resistance). The core magnetizing inductance, which shapes
 * the open-circuit response at the lowest frequencies, is added per section as Lm with a capacitive
 * bypass Cm and a loss resistance Rm; its effect fades above fCore, where eddy currents keep the
 * flux out of the laminations, so open- and short-circuit responses meet at high frequencies as
 * C57.149 6.2.2 describes. A short-circuit measurement leaves it out (C57.149 4.6.2, 6.2.2). Mutual coupling between sections is not modelled: the curves show trends qualitatively,
 * they are not a model of any real transformer.
 *
 * End-to-end measurement (IEC 60076-18, 2.6): V_in at the first node, response across 50 Ω at the
 * last node, H = V_out / V_in.
 */

export interface WindingModel {
  /** number of sections */
  n: number;
  /** total leakage (winding) inductance, H */
  L: number;
  /** total series resistance at low frequency, Ω */
  R: number;
  /** frequency above which conductor loss grows with √f (skin effect), Hz */
  fSkin: number;
  /** series capacitance of one section, F */
  Cs: number;
  /** shunt capacitance to ground of one section, F */
  Cg: number;
  /** dielectric loss factor tan δ of the series and shunt capacitances */
  tanD: number;
  /** total core magnetizing inductance, H */
  Lm: number;
  /** capacitive bypass of the magnetizing branch, total (series sum over the sections), F */
  Cm: number;
  /** core loss resistance, total, Ω */
  Rm: number;
  /** frequency above which the core no longer takes part (flux kept out of the laminations), Hz */
  fCore: number;
  /** inductance of the earth connection of the response lead, H (IEC 60076-18 Annex A) */
  Le: number;
  /** extra resistance at the terminal (contact), Ω */
  Rc: number;
  /** ratio between the highest and the lowest section resonance of the healthy winding (see profile) */
  spread: number;
}

/** Per-section factors: 1 = unchanged */
export interface SectionScale {
  L: number[];
  Cs: number[];
  Cg: number[];
  /** resistance added in series with the section inductance, Ω (0 = none); Cs still bridges it */
  Rx: number[];
}

export type TestType = "open" | "short";

/** A healthy winding whose response has the shape described in C57.149 6.2 (values chosen for that, not measured). */
export const HEALTHY: WindingModel = {
  n: 10,
  L: 0.08,
  R: 0.8,
  fSkin: 100,
  Cs: 30e-9,
  Cg: 0.48e-9,
  tanD: 0.04,
  Lm: 40,
  Cm: 1.6e-9,
  Rm: 250e3,
  fCore: 30e3,
  Le: 0,
  Rc: 0,
  spread: 60,
};

const ones = (n: number) => new Array<number>(n).fill(1);
export const noScale = (n: number): SectionScale => ({ L: ones(n), Cs: ones(n), Cg: ones(n), Rx: new Array<number>(n).fill(0) });

/**
 * Sections of a real winding are not identical (discs, tap winding, leads): their L·Cs resonances
 * spread over the frequency range. `spread` is the ratio between the highest and lowest section
 * resonance frequency; `split` how much of it comes from L (1) or from Cs (0). L keeps its total.
 */
export function profile(n: number, spread: number, split = 1): SectionScale {
  const fr = Array.from({ length: n }, (_, k) => spread ** (k / Math.max(1, n - 1)));
  const l = fr.map((x) => x ** (-2 * split));
  const norm = n / l.reduce((a, b) => a + b, 0);
  return { L: l.map((x) => x * norm), Cs: fr.map((x, k) => 1 / (x ** 2 * l[k] * norm)), Cg: ones(n), Rx: new Array<number>(n).fill(0) };
}

interface C {
  re: number;
  im: number;
}
const c = (re: number, im = 0): C => ({ re, im });
const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const sub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const inv = (a: C): C => div(c(1), a);

/** Frequency points evenly spaced on a log axis, 200 per decade as IEC 60076-18 4.5 asks of a measurement */
export function logFreq(f0 = 20, f1 = 2e6, perDecade = 200): number[] {
  const n = Math.round(Math.log10(f1 / f0) * perDecade);
  return Array.from({ length: n + 1 }, (_, i) => f0 * 10 ** (i / perDecade));
}

/**
 * Magnitude (dB) and phase (degrees) of V_out / V_in. Nodes 0..n; node 0 is driven, node n carries
 * the 50 Ω response impedance. The interior node voltages follow from a tridiagonal admittance
 * system solved for each frequency.
 */
export function response(
  m: WindingModel, faults: SectionScale, test: TestType, freq: number[],
): { magDb: number[]; phaseDeg: number[] } {
  const n = m.n;
  // the healthy profile along the winding, times the changes a fault makes to each section
  const base = profile(n, m.spread);
  const scale: SectionScale = {
    L: base.L.map((x, k) => x * faults.L[k]),
    Cs: base.Cs.map((x, k) => x * faults.Cs[k]),
    Cg: base.Cg.map((x, k) => x * faults.Cg[k]),
    Rx: faults.Rx,
  };
  const magDb: number[] = [];
  const phaseDeg: number[] = [];
  for (const f of freq) {
    const w = 2 * Math.PI * f;
    const rs = (m.R / n) * (1 + Math.sqrt(f / m.fSkin));
    // capacitance with dielectric loss: jωC(1 − j tan δ)
    const yc = (cap: number) => c(w * cap * m.tanD, w * cap);
    // series admittance of each section k (between nodes k and k+1)
    const ys: C[] = [];
    for (let k = 0; k < n; k++) {
      const zl = add(c(rs + scale.Rx[k]), c(0, (w * m.L * scale.L[k]) / n));
      let z = inv(add(inv(zl), yc(m.Cs * scale.Cs[k])));
      if (test === "open") {
        // magnetizing branch Lm ∥ Rm ∥ Cm in series with the section, fading out above fCore
        const ym = add(add(inv(c(0, (w * m.Lm) / n)), c(n / m.Rm)), yc(m.Cm * n));
        const fade = 1 / (1 + (f / m.fCore) ** 2);
        z = add(z, mul(inv(ym), c(fade)));
      }
      if (k === 0 && m.Rc) z = add(z, c(m.Rc));
      ys.push(inv(z));
    }
    const yg = (k: number) => yc(m.Cg * scale.Cg[k]);
    // response impedance: 50 Ω through the inductance of its earth connection
    const zLoad = add(c(50), c(0, w * m.Le));
    // unknowns: nodes 1..n; node 0 = 1 V
    const a: C[] = [];
    const b: C[] = [];
    const cc: C[] = [];
    const d: C[] = [];
    for (let i = 1; i <= n; i++) {
      const left = ys[i - 1];
      const right = i < n ? ys[i] : c(0);
      let diag = add(add(left, right), yg(i - 1));
      if (i === n) diag = add(diag, inv(zLoad));
      a.push(i > 1 ? sub(c(0), left) : c(0));
      b.push(diag);
      cc.push(i < n ? sub(c(0), right) : c(0));
      d.push(i === 1 ? left : c(0));
    }
    // Thomas algorithm
    for (let i = 1; i < n; i++) {
      const k = div(a[i], b[i - 1]);
      b[i] = sub(b[i], mul(k, cc[i - 1]));
      d[i] = sub(d[i], mul(k, d[i - 1]));
    }
    const v: C[] = new Array(n);
    v[n - 1] = div(d[n - 1], b[n - 1]);
    for (let i = n - 2; i >= 0; i--) v[i] = div(sub(d[i], mul(cc[i], v[i + 1])), b[i]);
    // measured across the 50 Ω, after the earth-connection inductance
    const out = mul(v[n - 1], div(c(50), zLoad));
    magDb.push(20 * Math.log10(Math.hypot(out.re, out.im)));
    phaseDeg.push((Math.atan2(out.im, out.re) * 180) / Math.PI);
  }
  return { magDb, phaseDeg };
}
