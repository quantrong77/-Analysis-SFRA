/**
 * CIGRE TB 812 numerical indices (spec 6.3), section 6.2.3, Table 6.2, eq. 6.3–6.19.
 * X = baseline, Y = test, magnitude in dB. Values only, no thresholds. Mirrors backend/app/core/indices.py.
 */
export type Tb812 = Record<"CC" | "CCF" | "LCC" | "ASLE" | "SD" | "CSD" | "MD" | "MAXABS", number | null>;

export function tb812Indices(x: number[], y: number[]): Tb812 {
  const out: Tb812 = { CC: null, CCF: null, LCC: null, ASLE: null, SD: null, CSD: null, MD: null, MAXABS: null };
  const n = x.length;
  if (n < 2) return out;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
  }
  const xm = sx / n, ym = sy / n;
  let sxx = 0, syy = 0, sxy = 0, xx = 0, yy = 0, xy = 0, sabs = 0, sdd = 0, see = 0;
  let md = -Infinity, mabs = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - xm, b = y[i] - ym, d = y[i] - x[i], e = b - a;
    sxx += a * a; syy += b * b; sxy += a * b;
    xx += x[i] * x[i]; yy += y[i] * y[i]; xy += x[i] * y[i];
    sabs += Math.abs(d); sdd += d * d; see += e * e;
    md = Math.max(md, d); mabs = Math.max(mabs, Math.abs(d));
  }
  const ccDen = Math.sqrt(xx * yy);
  out.CC = ccDen > 0 ? xy / ccDen : null;                                   // eq 6.14
  out.CCF = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;         // eq 6.13
  const lccDen = (ym - xm) ** 2 + syy / n + sxx / n;
  out.LCC = lccDen > 0 ? (2 * sxy) / n / lccDen : null;                     // eq 6.19
  out.ASLE = sabs / n;                                                      // eq 6.7 (data already in dB)
  out.SD = Math.sqrt(sdd / (n - 1));                                        // eq 6.3
  out.CSD = Math.sqrt(see / (n - 1));                                       // eq 6.18
  out.MD = md;                                                              // eq 6.12
  out.MAXABS = mabs;
  return out;
}
