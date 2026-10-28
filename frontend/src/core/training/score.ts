/**
 * Scoring of one training case against the answer the instructor set. Weights and the tolerance on
 * the measured frequency are internal (training.yaml scoring), overridable per pack.
 */
import type { PeakAnalysis, PeakMatch } from "../peaks";
import { TRAINING } from "./content";
import type { CaseAnswer, TrainingCase, TrainingPack } from "./pack";

export interface Response {
  fault: string;
  bands: string[];
  recommendation: string;
  /** frequency the trainee read for the resonance that moved most, Hz */
  measureHz: number | null;
}

export interface ItemScore {
  points: number;
  max: number;
  correct: boolean;
}

export interface CaseScore {
  fault: ItemScore;
  bands: ItemScore;
  recommendation: ItemScore;
  /** null when the case does not ask for it or the curves have no matched resonance that moved */
  measure: ItemScore | null;
  points: number;
  max: number;
  /** 0–100 */
  percent: number;
}

/** The matched resonance (peak or notch present in both curves) whose frequency moved most. */
export function largestShift(pa: PeakAnalysis): PeakMatch | null {
  let best: PeakMatch | null = null;
  for (const m of pa.matches) {
    if (m.ref && m.test && m.shiftPercent !== null && (!best || Math.abs(m.shiftPercent) > Math.abs(best.shiftPercent!))) best = m;
  }
  return best && best.shiftPercent !== 0 ? best : null;
}

export function weightsOf(pack: Pick<TrainingPack, "weights">) {
  return { ...TRAINING.scoring.weights, ...(pack.weights ?? {}) };
}

/** Bands: share of the right answer the trainee found, less wrong picks (Jaccard index). */
function bandShare(got: string[], want: string[]): number {
  if (!want.length && !got.length) return 1;
  const g = new Set(got);
  const w = new Set(want);
  const inter = [...g].filter((x) => w.has(x)).length;
  const union = new Set([...g, ...w]).size;
  return union ? inter / union : 0;
}

export function scoreCase(c: TrainingCase, r: Response, pa: PeakAnalysis | null, pack: Pick<TrainingPack, "weights">): CaseScore {
  const w = weightsOf(pack);
  const a: CaseAnswer = c.answer;
  const item = (ok: boolean, max: number): ItemScore => ({ points: ok ? max : 0, max, correct: ok });
  const fault = item(r.fault === a.fault, w.fault);
  const share = bandShare(r.bands, a.bands);
  const bands: ItemScore = { points: Math.round(share * w.bands * 10) / 10, max: w.bands, correct: share === 1 };
  const recommendation = item(r.recommendation === a.recommendation, w.recommendation);
  let measure: ItemScore | null = null;
  const target = c.askMeasure && pa ? largestShift(pa) : null;
  if (target) {
    const tol = TRAINING.scoring.measure_tolerance_pct / 100;
    const near = (f: number | undefined) => f !== undefined && r.measureHz !== null && Math.abs(r.measureHz - f) <= tol * f;
    measure = item(near(target.ref?.freq) || near(target.test?.freq), w.measure);
  }
  const parts = [fault, bands, recommendation, ...(measure ? [measure] : [])];
  const points = parts.reduce((s, p) => s + p.points, 0);
  const max = parts.reduce((s, p) => s + p.max, 0);
  return { fault, bands, recommendation, measure, points, max, percent: max ? Math.round((points / max) * 1000) / 10 : 0 };
}
