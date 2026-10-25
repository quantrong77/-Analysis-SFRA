/** Workspace state: loaded traces, pairing choices per transformer, computed results. */
import { analyzePair, type PairResult } from "./core/analysis";
import { buildRows, dayKey, groupTraces, type PairRow, type TransformerGroup } from "./core/pairing";
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
    const baselineSession = g.sessions.includes(p.baselineSession) ? p.baselineSession : g.baselineSession;
    const testSession = g.sessions.includes(p.testSession) ? p.testSession : g.testSession;
    const list = traces.filter((t) => t.transformerKey === g.key);
    const rows = buildRows(list, baselineSession, testSession).map((r) => {
      const old = p.rows.find((o) => o.key === r.key);
      if (!old) return r;
      const ok = (id: string | null) => id === null || r.candidates.includes(id);
      const sameSessions = p.baselineSession === baselineSession && p.testSession === testSession;
      return sameSessions && ok(old.baselineId) && ok(old.testId) ? { ...r, baselineId: old.baselineId, testId: old.testId } : r;
    });
    return { ...g, baselineSession, testSession, rows };
  });
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
