/** Transformer conclusion from templates in standards.yaml (spec 6.8). No free text here. */
import type { PairResult } from "./analysis";
import type { Classification } from "./dlt911";
import type { Standards } from "./standards";

export function fmtNum(v: number | null | undefined, std: Standards, decimals?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const s = v.toFixed(decimals ?? std.report.decimals);
  return std.report.decimal_comma ? s.replace(".", ",") : s;
}

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

const ref = (r: PairResult) => (r.index !== null ? String(r.index) : r.label);

export interface Conclusion {
  worst: Classification;
  sentences: string[];
  text: string;
}

export function transformerConclusion(results: PairResult[], std: Standards): Conclusion {
  if (!results.length) throw new Error("Không có phép đo nào để kết luận");
  const t = std.conclusion.templates;
  const worst = results.map((r) => r.classification).reduce((a, b) => (b.rank > a.rank ? b : a));
  const nNormal = results.filter((r) => r.classification.id === "normal").length;
  const nTotal = results.length;
  const sentences: string[] = [];
  if (nNormal === nTotal) {
    sentences.push(fill(t.all_normal, { n_normal: nNormal, n_total: nTotal }));
  } else {
    const items = results.filter((r) => r.classification.id === worst.id);
    sentences.push(fill(t.not_all_normal, {
      n_normal: nNormal, n_total: nTotal, worst_label: worst.label,
      worst_list: items.map((r) => `phép đo ${ref(r)}, ${r.label}`).join(", "),
    }));
  }
  const mins: string[] = [];
  for (const band of ["LF", "HF"]) {
    const have = results.filter((r) => r.bands[band]?.rxy !== null);
    if (!have.length) continue;
    const m = have.reduce((a, b) => ((b.bands[band].rxy as number) < (a.bands[band].rxy as number) ? b : a));
    mins.push(fill(t.min_band, { band: `R${band}`, value: fmtNum(m.bands[band].rxy, std), index: ref(m), label: m.label }));
  }
  if (mins.length) sentences.push(mins.join("; ") + ".");
  const rev = results.filter((r) => r.warnings.some((w) => w.code === "reversed_leads"));
  if (rev.length) {
    sentences.push(fill(t.reversed_leads, { count: rev.length, list: rev.map((r) => `${ref(r)} ${r.label}`).join(", ") }));
  }
  const diff = results.filter((r) => r.warnings.some((w) => w.code.startsWith("diff_")));
  if (diff.length) {
    sentences.push(fill(t.config_diff, { count: diff.length, list: diff.map((r) => `${ref(r)} ${r.label}`).join(", ") }));
  }
  const modes = [...new Set(results.map((r) => r.aligned.modeLabel))].sort();
  sentences.push(fill(t.resample, { mode: modes.join("; ") }));
  return { worst, sentences, text: sentences.join(" ") };
}
