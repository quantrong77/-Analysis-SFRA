/**
 * Multi-session trend (spec 6.6). For every measurement key, Rxy of each session is computed
 * against the baseline (never against the previous session), all with one grid mode.
 * Status rules come from standards.yaml `trend` (internal thresholds).
 */
import { analyzePair, measurementGroup, type PairResult } from "./analysis";
import { dayKey, displayLabel, pairKey, sortKey } from "./pairing";
import { gridsMatch, type GridMode } from "./resample";
import { fmtNum } from "./rules";
import type { Standards } from "./standards";
import type { Trace } from "./types";

export interface TrendPoint {
  session: string;
  trace: Trace;
  result: PairResult | null;
  error: string | null;
}

export interface TrendStatus {
  id: "insufficient" | "stable" | "warning";
  label: string;
  rank: number;
  messages: string[];
  source: string;
}

export interface TrendSeries {
  key: string;
  index: number | null;
  label: string;
  group: { id: string; label: string };
  baseline: Trace | null;
  points: TrendPoint[];
  status: TrendStatus;
}

export interface TrendResult {
  baselineSession: string;
  sessions: string[];
  /** grid mode actually used for every point */
  mode: "A" | "B" | "C";
  series: TrendSeries[];
}

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

const fmtSession = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

/** One mode for the whole history: auto -> A only if every pair shares the baseline grid, else B. */
function chooseMode(pairs: [Trace, Trace][], mode: GridMode, rtol: number): "A" | "B" | "C" {
  if (mode !== "auto") return mode;
  return pairs.every(([a, b]) => gridsMatch(a.freq, b.freq, rtol)) ? "A" : "B";
}

export function trendStatus(points: TrendPoint[], std: Standards): TrendStatus {
  const t = std.trend;
  const st = (id: TrendStatus["id"], messages: string[]): TrendStatus => ({
    id, label: t.statuses[id].label, rank: t.statuses[id].rank, messages, source: t.source,
  });
  const ok = points.filter((p) => p.result);
  const n = ok.length + 1; // + baseline
  if (n < t.min_sessions) return st("insufficient", [fill(t.templates.insufficient, { n, min: t.min_sessions })]);

  const pct = (x: number) => fmtNum(x * 100, std, 1);
  const msgs: string[] = [];
  let firstLabel = "";
  for (const band of t.bands_checked as string[]) {
    const withR = ok.filter((p) => p.result!.bands[band]?.rxy !== null && p.result!.bands[band]?.rxy !== undefined);
    if (!withR.length) continue;
    const first = withR[0];
    const r0 = first.result!.bands[band].rxy as number;
    firstLabel = fmtSession(first.session);
    for (const p of withR.slice(1)) {
      const r = p.result!.bands[band].rxy as number;
      const drop = (r0 - r) / r0;
      if (drop > t.rmf_rhf_drop_ratio) {
        msgs.push(fill(t.templates.drop, {
          band, pct: pct(drop), first: firstLabel, from: fmtNum(r0, std), to: fmtNum(r, std), date: fmtSession(p.session),
        }));
      }
    }
  }
  if (msgs.length) return st("warning", msgs);
  return st("stable", [fill(t.templates.stable, { pct: pct(t.rmf_rhf_drop_ratio), first: firstLabel || "đầu tiên" })]);
}

export function computeTrend(traces: Trace[], baselineSession: string, std: Standards, mode: GridMode = "auto"): TrendResult {
  const byKey = new Map<string, Trace[]>();
  for (const t of traces) byKey.set(pairKey(t), [...(byKey.get(pairKey(t)) ?? []), t]);
  const sessions = [...new Set(traces.map((t) => dayKey(t.testDate)))].sort();

  // per key: baseline trace and the latest trace of every other session
  const plan = [...byKey].map(([key, list]) => {
    const latest = (s: string) =>
      list.filter((t) => dayKey(t.testDate) === s).sort((a, b) => (a.testDate?.getTime() ?? 0) - (b.testDate?.getTime() ?? 0)).pop();
    const baseline = latest(baselineSession) ?? null;
    const others = sessions.filter((s) => s !== baselineSession).flatMap((s) => {
      const t = latest(s);
      return t ? [{ session: s, trace: t }] : [];
    });
    return { key, list, baseline, others };
  });
  const r = std.resample;
  const used = chooseMode(
    plan.flatMap((p) => (p.baseline ? p.others.map((o) => [p.baseline!, o.trace] as [Trace, Trace]) : [])),
    mode, r.grid_match_rtol,
  );

  const series: TrendSeries[] = plan.map(({ key, list, baseline, others }) => {
    const points: TrendPoint[] = others.map(({ session, trace }) => {
      if (!baseline) return { session, trace, result: null, error: "Không có baseline cho phép đo này" };
      try {
        return { session, trace, result: analyzePair(baseline, trace, std, { mode: used, index: trace.index, label: displayLabel(trace) }), error: null };
      } catch (e) {
        return { session, trace, result: null, error: (e as Error).message };
      }
    });
    const first = list[0];
    return {
      key, index: first.index, label: displayLabel(first), group: measurementGroup(first.label, std),
      baseline, points, status: trendStatus(points, std),
    };
  });
  series.sort(sortKey);
  return { baselineSession, sessions, mode: used, series };
}
