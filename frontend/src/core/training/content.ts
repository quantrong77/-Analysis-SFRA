/** Training content (training.yaml): theory, measurement setups, checklist, failure modes, answer options. */
import { load } from "js-yaml";
import yamlText from "./training.yaml?raw";

export interface Sourced {
  text: string;
  source: string;
}

export interface TheorySection {
  id: string;
  title: string;
  items: Sourced[];
}

export interface Setup {
  id: string;
  label: string;
  definition: string;
  source: string;
  note: string;
  /** terminal the source and reference leads go to */
  vin: string;
  /** terminal the response lead goes to */
  vout: string;
  shorted: string[];
  grounded: string[];
}

export interface FaultInfo {
  id: string;
  label: string;
  source: string;
  summary: string;
  regions: { range: string; text: string }[];
  /** answer bands (ids of `bands`) this failure mode shows most in */
  bands: string[];
  /** shown in the fault simulator */
  simulated: boolean;
  /** what the source table says per answer band, for matching real data (see interpret.ts) */
  signature?: Signature;
  /** recommendation ids suggested when this failure mode fits */
  suggest?: string[];
}

export type RegionState = "changed" | "unchanged";
export type FeatureId = "core_shift_up" | "lf_rise" | "broad_drop";

export interface Signature {
  /** band the table names as the most obvious one, or "none" */
  primary: string;
  /** per band: changed / unchanged in an open-circuit (end-to-end) measurement */
  open?: Record<string, RegionState>;
  /** the same for a short-circuit measurement */
  short?: Record<string, RegionState>;
  /** features the failure mode is told by; a required one counts against the mode when absent */
  features?: { id: FeatureId; required: boolean }[];
}

export interface AnswerBand {
  id: string;
  label: string;
  f_min: number;
  f_max: number;
}

export interface Recommendation {
  id: string;
  label: string;
  source: string;
}

export interface ScoringCfg {
  weights: { fault: number; bands: number; measure: number; recommendation: number };
  measure_tolerance_pct: number;
  source: string;
}

export interface Training {
  meta: { title: string; note: string };
  theory: TheorySection[];
  setups: Setup[];
  checklist: { group: string; items: Sourced[] }[];
  /** full entries of the documents the theory cites, by the short name used in `source` */
  bibliography: { key: string; text: string }[];
  bands: AnswerBand[];
  bands_source: string;
  faults: FaultInfo[];
  recommendations: Recommendation[];
  scoring: ScoringCfg;
}

export const TRAINING = load(yamlText) as Training;

export const faultInfo = (id: string): FaultInfo | undefined => TRAINING.faults.find((f) => f.id === id);
