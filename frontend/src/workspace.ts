/** Workspace state: loaded traces, pairing choices per transformer, computed results. */
import { analyzePair, type PairResult } from "./core/analysis";
import { buildRows, dayKey, groupTraces, UNKNOWN_DAY, type PairRow, type TransformerGroup } from "./core/pairing";
import type { GridMode } from "./core/resample";
import type { Standards } from "./core/standards";
import type { Trace } from "./core/types";

export interface LoadError {
  file: string;
  message: string;
}

export interface RowResult {
  row: PairRow;
  result: PairResult | null;
  error: string | null;
}

/** Regroup after traces change, keeping the user's session choices and per-row overrides. */
export function regroup(traces: Trace[], previous: TransformerGroup[]): TransformerGroup[] {
  const prev = new Map(previous.map((g) => [g.key, g]));
  return groupTraces(traces).map((g) => {
    const p = prev.get(g.key);
    if (!p) return g;
    const list = traces.filter((t) => t.transformerKey === g.key);
    // a chosen session whose date was edited no longer exists under its old day: follow its files
    // to the day they now carry, so the choice moves with them instead of falling back to the default
    const day = new Map(list.map((t) => [t.id, dayKey(t.testDate)]));
    const follow = (s: string, ids: (string | null)[]) => {
      if (g.sessions.includes(s)) return s;
      const counts = new Map<string, number>();
      for (const id of ids) {
        const d = id ? day.get(id) : undefined;
        if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      return [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? s;
    };
    const pBaseline = follow(p.baselineSession, p.rows.map((r) => r.baselineId));
    const pTest = follow(p.testSession, p.rows.map((r) => r.testId));
    // keep the user's sessions unless they no longer exist, are the undated session while dated
    // ones exist, or were a single session and a second one has appeared (e.g. a date was entered)
    const known = g.sessions.filter((s) => s !== UNKNOWN_DAY);
    const stale = pBaseline === pTest && known.length > 1;
    const keep = (s: string) => !stale && g.sessions.includes(s) && (s !== UNKNOWN_DAY || known.length === 0);
    const baselineSession = keep(pBaseline) ? pBaseline : g.baselineSession;
    const testSession = keep(pTest) ? pTest : g.testSession;
    const rows = buildRows(list, baselineSession, testSession).map((r) => {
      const old = p.rows.find((o) => o.key === r.key);
      // files added to or removed from this measurement: the user's earlier choice no longer applies
      const sameFiles = old && old.candidates.length === r.candidates.length && old.candidates.every((id) => r.candidates.includes(id));
      if (!old || !sameFiles) return r;
      const ok = (id: string | null) => id === null || r.candidates.includes(id);
      const sameSessions = pBaseline === baselineSession && pTest === testSession;
      return sameSessions && ok(old.baselineId) && ok(old.testId) ? { ...r, baselineId: old.baselineId, testId: old.testId } : r;
    });
    return { ...g, baselineSession, testSession, rows };
  });
}

/** Which frame of the import screen a file was loaded in: baseline files or files of the test being evaluated. */
export type FileRole = "baseline" | "test";

const majorityDay = (list: Trace[]): string | null => {
  const counts = new Map<string, number>();
  for (const t of list) if (t.testDate) counts.set(dayKey(t.testDate), (counts.get(dayKey(t.testDate)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/**
 * Sessions follow the frame files were loaded in: files just loaded as baseline make their day the
 * baseline session, files just loaded as test make theirs the test session. When that leaves both on
 * the same day, the other side is taken from the earlier loaded files of the other role, if any.
 * `fresh` holds the files just loaded (sha256 -> role); `roles` every file loaded through a frame.
 */
export function applyRoles(
  g: TransformerGroup, traces: Trace[], roles: Record<string, FileRole>, fresh: Map<string, FileRole>,
): TransformerGroup {
  const list = traces.filter((t) => t.transformerKey === g.key);
  const of = (role: FileRole, onlyFresh: boolean) =>
    majorityDay(list.filter((t) => (onlyFresh ? fresh.get(t.sha256) : roles[t.sha256]) === role));
  const fb = of("baseline", true);
  const ft = of("test", true);
  if (!fb && !ft) return g;
  let b = fb ?? g.baselineSession;
  let t = ft ?? g.testSession;
  if (b === t) {
    const ab = of("baseline", false);
    const at = of("test", false);
    if (fb && at && at !== b) t = at;
    else if (ft && ab && ab !== t) b = ab;
  }
  if (!g.sessions.includes(b) || !g.sessions.includes(t)) return g;
  return b === g.baselineSession && t === g.testSession ? g : setSessions(g, traces, b, t);
}

export function setSessions(g: TransformerGroup, traces: Trace[], baselineSession: string, testSession: string): TransformerGroup {
  const list = traces.filter((t) => t.transformerKey === g.key);
  return { ...g, baselineSession, testSession, rows: buildRows(list, baselineSession, testSession) };
}

export function computeResults(g: TransformerGroup, byId: Map<string, Trace>, std: Standards, mode: GridMode): RowResult[] {
  return g.rows.map((row) => {
    const ref = row.baselineId ? byId.get(row.baselineId) : undefined;
    const test = row.testId ? byId.get(row.testId) : undefined;
    if (!ref || !test) {
      const error = !ref ? "Thiếu file baseline" : g.baselineSession === g.testSession ? "Chưa có kỳ đo thứ hai" : "Thiếu file lần đo";
      return { row, result: null, error };
    }
    if (ref.id === test.id) return { row, result: null, error: "Baseline và lần đo là cùng một file" };
    try {
      return { row, result: analyzePair(ref, test, std, { mode, index: row.index, label: row.label }), error: null };
    } catch (e) {
      return { row, result: null, error: (e as Error).message };
    }
  });
}

export const fmtDate = (d: Date | null): string =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : "–";

export const fmtDateTime = (d: Date | null): string =>
  d ? `${fmtDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "–";

export const sessionLabel = (s: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export { dayKey };
