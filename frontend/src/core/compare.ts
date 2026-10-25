/**
 * Reference comparison (spec 6.7): between phases of one session, or between any two traces
 * (sister units). Indices only, labelled "So sánh tham khảo"; never classified by Table A.1.
 */
import { indicesFor, type RangeIndices } from "./analysis";
import { analyzePeaks, type PeakAnalysis } from "./peaks";
import { dayKey } from "./pairing";
import { align, type AlignedPair, type GridMode } from "./resample";
import type { Standards } from "./standards";
import type { Trace } from "./types";

export interface RefComparison {
  a: Trace;
  b: Trace;
  aligned: AlignedPair;
  bands: RangeIndices[];
  zones: RangeIndices[];
  peaks: PeakAnalysis;
}

export function compareTraces(a: Trace, b: Trace, std: Standards, mode: GridMode = "auto"): RefComparison {
  const r = std.resample;
  const aligned = align(a, b, mode, r.log_grid_points_per_decade, r.grid_match_rtol);
  const idx = indicesFor(aligned, std);
  return { a, b, aligned, bands: idx.bands, zones: idx.zones, peaks: analyzePeaks(a, b, std) };
}

/** "B-b" -> "P-p", "C-N" -> "P-N", "Y2-Y3" -> "Yi-Yj"; null when the label names no phase. */
export function phasePattern(label: string): { pattern: string; phase: string } | null {
  const y = /^Y(\d)-Y(\d)$/.exec(label);
  if (y) return { pattern: "Yi-Yj", phase: `Y${y[1]}-Y${y[2]}` };
  const m = /^([ABCabc])-([ABCabcNn])$/.exec(label);
  if (!m) return null;
  const norm = (c: string) => (/[ABC]/.test(c) ? "P" : /[abc]/.test(c) ? "p" : c);
  return { pattern: `${norm(m[1])}-${norm(m[2])}`, phase: m[1].toUpperCase() };
}

const normShort = (s: string, aliases: Record<string, string>) =>
  s.split("-").map((p) => aliases[p.trim()] ?? p.trim()).map((p) => p.replace(/^[ABC]$/, "P").replace(/^[abc]$/, "p")).join("-").toLowerCase();

export interface PhaseGroup {
  key: string;
  session: string;
  pattern: string;
  measurementType: string;
  shorted: string;
  members: { phase: string; trace: Trace }[];
}

/** Groups of the same measurement on different phases, per session (≥ 2 phases). */
export function phaseGroups(traces: Trace[], std: Standards): PhaseGroup[] {
  const aliases: Record<string, string> = std.quality.pair.terminal_aliases?.map ?? {};
  const map = new Map<string, PhaseGroup>();
  for (const t of traces) {
    const pp = phasePattern(t.label);
    if (!pp) continue;
    const session = dayKey(t.testDate);
    const shorted = normShort(t.setting.shortedTerminal, aliases);
    const key = `${session}|${pp.pattern}|${t.setting.measurementType.toLowerCase()}|${shorted}`;
    const g = map.get(key) ?? { key, session, pattern: pp.pattern, measurementType: t.setting.measurementType, shorted: t.setting.shortedTerminal, members: [] };
    if (!g.members.some((m) => m.phase === pp.phase)) g.members.push({ phase: pp.phase, trace: t });
    map.set(key, g);
  }
  return [...map.values()]
    .filter((g) => g.members.length >= 2)
    .map((g) => ({ ...g, members: g.members.sort((x, y) => x.phase.localeCompare(y.phase)) }))
    .sort((x, y) => x.session.localeCompare(y.session) || Math.min(...x.members.map((m) => m.trace.index ?? 999)) - Math.min(...y.members.map((m) => m.trace.index ?? 999)));
}

/** Every pair of phases in a group: A–B, A–C, B–C. */
export function phasePairs(g: PhaseGroup): [Trace, Trace][] {
  const out: [Trace, Trace][] = [];
  for (let i = 0; i < g.members.length; i++) for (let j = i + 1; j < g.members.length; j++) out.push([g.members[i].trace, g.members[j].trace]);
  return out;
}
