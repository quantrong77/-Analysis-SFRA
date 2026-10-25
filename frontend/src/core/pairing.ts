/**
 * Pairing (spec 4.4). Key = STT + measurement label (from the file name when it follows
 * STT_PhepDo_date_time, otherwise the sweep / trace name). Never the traceName inside a
 * FRA v2.0 file. Transformers grouped by serial number; oldest session = default baseline.
 */
import type { Trace } from "./types";

export const dayKey = (d: Date | null): string =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "(không rõ ngày)";

const normCfg = (s: string) => s.trim().toLowerCase();
const hasShort = (t: Trace) => !["", "none"].includes(normCfg(t.setting.shortedTerminal));

/**
 * Open / short-circuit configuration of a trace. Doble .sfra stores measurementType as a number
 * that is 0 even for short-circuit tests and often leaves shortedTerminal empty, so the shorted
 * terminals, a "short" measurement type and a "short" in the file name are all accepted.
 */
export const measurementConfig = (t: Trace): string =>
  hasShort(t) ? normCfg(t.setting.shortedTerminal) : /short/i.test(t.setting.measurementType) || /short/i.test(t.sourceName) ? "short" : "open";

/**
 * With an STT in the file name the key is STT + label (spec 4.4). Without one, the label alone
 * can hide different configurations (e.g. "b-N" open circuit and "b-N" with Y1-Y2 shorted), so
 * the configuration is added to the key.
 */
export const pairKey = (t: Trace): string => (t.index !== null ? `${t.index}|${t.label}` : `|${t.label}|${measurementConfig(t)}`);

/** Label shown in tables: adds the shorted terminals when the key depends on them. */
export const displayLabel = (t: Trace): string =>
  t.index !== null || measurementConfig(t) === "open"
    ? t.label
    : `${t.label} (nối tắt${hasShort(t) ? ` ${t.setting.shortedTerminal}` : ""})`;

export interface PairRow {
  key: string;
  index: number | null;
  label: string;
  baselineId: string | null;
  testId: string | null;
  /** All candidate traces for this key, oldest first */
  candidates: string[];
}

export interface TransformerGroup {
  key: string;
  serialNumber: string;
  locations: string[];
  sessions: string[];
  baselineSession: string;
  testSession: string;
  rows: PairRow[];
}

export function sortKey(a: { index: number | null; label: string }, b: { index: number | null; label: string }): number {
  const ai = a.index ?? Number.MAX_SAFE_INTEGER;
  const bi = b.index ?? Number.MAX_SAFE_INTEGER;
  return ai - bi || a.label.localeCompare(b.label);
}

/** Build rows for one transformer with a chosen baseline / test session. */
export function buildRows(traces: Trace[], baselineSession: string, testSession: string): PairRow[] {
  const byKey = new Map<string, Trace[]>();
  for (const t of traces) {
    const k = pairKey(t);
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  const rows: PairRow[] = [];
  for (const [key, list] of byKey) {
    list.sort((a, b) => (a.testDate?.getTime() ?? 0) - (b.testDate?.getTime() ?? 0));
    // several files of one key on the same day: the latest is used
    const pick = (s: string) => [...list].reverse().find((t) => dayKey(t.testDate) === s)?.id ?? null;
    rows.push({
      key, index: list[0].index, label: displayLabel(list[0]),
      baselineId: pick(baselineSession),
      // one session only: nothing to compare against
      testId: testSession === baselineSession ? null : pick(testSession),
      candidates: list.map((t) => t.id),
    });
  }
  return rows.sort(sortKey);
}

export function groupTraces(traces: Trace[]): TransformerGroup[] {
  const byTx = new Map<string, Trace[]>();
  for (const t of traces) byTx.set(t.transformerKey, [...(byTx.get(t.transformerKey) ?? []), t]);
  const groups: TransformerGroup[] = [];
  for (const [key, list] of byTx) {
    const sessions = [...new Set(list.map((t) => dayKey(t.testDate)))].sort();
    const baselineSession = sessions[0];
    const testSession = sessions[sessions.length - 1];
    groups.push({
      key,
      serialNumber: list[0].serialNumber,
      locations: [...new Set(list.map((t) => t.location).filter(Boolean))].sort(),
      sessions, baselineSession, testSession,
      rows: buildRows(list, baselineSession, testSession),
    });
  }
  // transformers that can be compared (two or more sessions) first
  return groups.sort((a, b) => Number(b.sessions.length > 1) - Number(a.sessions.length > 1) || a.key.localeCompare(b.key));
}
