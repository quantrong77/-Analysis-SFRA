import { load } from "js-yaml";
// Single source of truth shared with the Python reference implementation.
import yamlText from "../../../backend/app/config/standards.yaml?raw";

export interface BandCfg {
  label: string;
  f_min: number;
  f_max: number;
  include_min: boolean;
  include_max: boolean;
  threshold: number;
  source: string;
}

export interface LevelCfg {
  id: string;
  label: string;
  label_en: string;
  rank: number;
  in_standard: boolean;
  source?: string;
  note?: string;
  any?: Record<string, Record<string, number>>[];
}

// The YAML is loosely typed below the documented keys.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Standards = Record<string, any> & {
  ruleset: { id: string; version: string; date: string; description: string };
  dlt911: {
    source: string;
    rxy_max: number;
    rxy_eps: number;
    bands: Record<string, BandCfg>;
    classification: { source: string; levels: LevelCfg[]; insufficient: LevelCfg };
  };
  versionTag: string;
  sha256: string;
  rawText: string;
  /** true when the text differs from the built-in standards.yaml */
  isCustom: boolean;
};

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function loadStandards(text: string = yamlText): Promise<Standards> {
  const data = load(text) as Standards;
  const sha = await sha256Hex(text);
  data.sha256 = sha;
  data.versionTag = `${data.ruleset.version}+${sha.slice(0, 12)}`;
  data.rawText = text;
  data.isCustom = text !== yamlText;
  if (data.isCustom) data.versionTag += " (tùy chỉnh)";
  return data;
}

export const STANDARDS_TEXT: string = yamlText;

const REQUIRED = [
  "ruleset.version", "dlt911.bands", "dlt911.classification.levels", "dlt911.classification.insufficient", "actions.by_level",
  "resample.default_mode", "quality.pair", "iec_zones.zones", "peaks.prominence_db", "tb812.indices", "trend.statuses",
  "measurement_groups.groups", "conclusion.templates", "report.decimals", "reference_comparison.label",
];

/** Validate an edited ruleset before it is used; returns the problems found (empty = usable). */
export async function validateStandards(text: string, probe: (s: Standards) => void): Promise<{ std: Standards | null; problems: string[] }> {
  let s: Standards;
  try {
    s = await loadStandards(text);
  } catch (e) {
    return { std: null, problems: [`YAML không hợp lệ: ${(e as Error).message}`] };
  }
  const problems: string[] = [];
  for (const path of REQUIRED) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = path.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), s);
    if (v === undefined || v === null) problems.push(`Thiếu mục ${path}`);
  }
  if (!problems.length) {
    try {
      probe(s);
    } catch (e) {
      problems.push(`Bộ quy tắc không chạy được: ${(e as Error).message}`);
    }
  }
  return { std: problems.length ? null : s, problems };
}
