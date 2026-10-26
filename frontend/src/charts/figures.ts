/** Plotly figures shared by the detail screen and the Word report. */
import type { PairResult } from "../core/analysis";
import type { Extremum, PeakAnalysis } from "../core/peaks";
import { dayKey } from "../core/pairing";
import type { Standards } from "../core/standards";
import type { Trace } from "../core/types";

export interface Figure {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}

const BAND_FILL: Record<string, string> = {
  LF: "rgba(30,78,121,0.055)",
  MF: "rgba(46,125,79,0.06)",
  HF: "rgba(143,106,0,0.07)",
};
export const BASELINE_COLOR = "#1e4e79";
export const TEST_COLOR = "#c0392b";
const EXTRA_COLORS = ["#5e4794", "#2e7d4f", "#8f6a00", "#0f7c8c", "#9c3d6f", "#59636e"];

const sessionLabel = (t: Trace) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey(t.testDate));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "?";
};

// typical-influence zones: [r, g, b, alpha], strong enough to read as regions behind the curves
const ZONE_RGBA: Record<string, [number, number, number, number]> = {
  core: [201, 156, 52, 0.22],
  interaction: [124, 98, 184, 0.2],
  winding: [52, 120, 170, 0.15],
  leads: [110, 120, 132, 0.26],
};
/** Fill colour of a typical-influence zone, for keys drawn outside the chart */
export const zoneFill = (key: string): string => rgba(ZONE_RGBA[key] ?? [0, 0, 0, 0.05]);
const rgba = ([r, g, b, a]: [number, number, number, number]) => `rgba(${r},${g},${b},${a.toFixed(3)})`;
const mix = (a: [number, number, number, number], b: [number, number, number, number], t: number) =>
  a.map((v, i) => v + (b[i] - v) * t) as [number, number, number, number];
/** Half width of the blend between two neighbouring zones: decades on a log axis, share of the span on a linear one */
const BLEND_LOG = 0.12;
const BLEND_LIN = 0.015;
const BLEND_STEPS = 8;

/** What is drawn behind the curves: DL/T 911 bands, IEC 60076-18 zones, or nothing. */
export type Backdrop = "dlt911" | "iec" | "none";

export interface PlotOptions {
  scale?: "log" | "linear";
  backdrop?: Backdrop;
  /** Text and colour written in each DL/T 911 band, e.g. the band's Rxy */
  bandLabels?: Record<string, { text: string; color: string }>;
  /** Paper heights (0 bottom, 1 top) where region labels are written; one per stacked plot */
  labelRows?: number[];
}

interface Region {
  key: string;
  label: string;
  lo: number;
  hi: number;
  fill: string;
  rgba?: [number, number, number, number];
}

// IEC zones run from 0 Hz to infinity: clip them to the measured range so they can be drawn on a log axis.
function regions(std: Standards, opt: PlotOptions, fLo: number, fHi: number): Region[] {
  const backdrop = opt.backdrop ?? "dlt911";
  if (backdrop === "dlt911") {
    return Object.entries(std.dlt911.bands).map(([k, b]) => ({
      key: k, label: opt.bandLabels?.[k]?.text ?? k, lo: b.f_min, hi: b.f_max, fill: BAND_FILL[k] ?? "rgba(0,0,0,0.04)",
    }));
  }
  if (backdrop === "iec") {
    return Object.entries(std.iec_zones.zones as Record<string, { label: string; f_min: number; f_max: number }>)
      .map(([k, z]) => {
        const c = ZONE_RGBA[k] ?? ([0, 0, 0, 0.05] as [number, number, number, number]);
        return { key: k, label: z.label, lo: Math.max(z.f_min, fLo), hi: Math.min(z.f_max, fHi), fill: rgba(c), rgba: c };
      })
      .filter((z) => z.hi > z.lo);
  }
  return [];
}

// On a log axis Plotly takes shape x in data units but annotation x in log10 units.
function backdrop(std: Standards, opt: PlotOptions, fLo: number, fHi: number) {
  const log = (opt.scale ?? "log") === "log";
  const list = regions(std, opt, fLo, fHi);
  const pos = (f: number) => (log ? Math.log10(f) : f);
  // an IEC zone label wider than its zone would run into the next one; DL/T band labels carry Rxy and always show
  const wide = (z: Region) => opt.backdrop !== "iec" || (pos(z.hi) - pos(z.lo)) / (pos(fHi) - pos(fLo)) >= 0.06;
  const from = (v: number) => (log ? 10 ** v : v);
  const rect = (x0: number, x1: number, fill: string) => ({
    type: "rect", xref: "x", yref: "paper", x0, x1, y0: 0, y1: 1, fillcolor: fill, line: { width: 0 }, layer: "below",
  });
  const shapes: Record<string, unknown>[] = [];
  if (opt.backdrop === "iec") {
    // zones fade into each other over a short stretch around each boundary instead of a hard edge
    const half = log ? BLEND_LOG : BLEND_LIN * (fHi - fLo);
    list.forEach((z, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      const lo = prev ? Math.min(pos(z.lo) + half, (pos(z.lo) + pos(z.hi)) / 2) : pos(z.lo);
      const hi = next ? Math.max(pos(z.hi) - half, (pos(z.lo) + pos(z.hi)) / 2) : pos(z.hi);
      shapes.push(rect(from(lo), from(hi), z.fill));
      if (next && z.rgba && next.rgba) {
        const b = pos(z.hi);
        const end = Math.min(b + half, (pos(next.lo) + pos(next.hi)) / 2);
        for (let k = 0; k < BLEND_STEPS; k++) {
          const a = hi + ((end - hi) * k) / BLEND_STEPS;
          const c = hi + ((end - hi) * (k + 1)) / BLEND_STEPS;
          shapes.push(rect(from(a), from(c), rgba(mix(z.rgba, next.rgba, (k + 0.5) / BLEND_STEPS))));
        }
      }
    });
  } else {
    for (const z of list) shapes.push(rect(z.lo, z.hi, z.fill));
  }
  const rows = opt.labelRows ?? [0.995];
  return {
    shapes,
    annotations: rows.flatMap((y) =>
      list.filter(wide).map((z) => ({
        xref: "x", yref: "paper", x: log ? (Math.log10(z.lo) + Math.log10(z.hi)) / 2 : (z.lo + z.hi) / 2, y, yanchor: "top",
        text: z.label, showarrow: false,
        font: { size: 12, color: opt.bandLabels?.[z.key]?.color ?? (opt.backdrop === "iec" ? "#2f3b47" : "#6a7682") },
        ...(opt.backdrop === "iec" ? { bgcolor: "rgba(255,255,255,0.72)", borderpad: 2 } : {}),
      })),
    ),
  };
}

const span = (traces: Trace[]): [number, number] => {
  const all = traces.flatMap((t) => [t.freq[0], t.freq[t.freq.length - 1]]);
  return [Math.min(...all), Math.max(...all)];
};

const AXIS = {
  title: { text: "Tần số (Hz)" }, exponentformat: "SI", gridcolor: "#e3e7eb",
  linecolor: "#b9c1c9", minor: { showgrid: true, gridcolor: "#f1f3f5" },
};
const xAxisOf = (opt: PlotOptions) => ({ ...AXIS, type: opt.scale ?? "log" });

type TwoTraces = Pick<PairResult, "baseline" | "test">;
/** Curve names: baseline/test by default, or e.g. ["Pha A", "Pha B"] for a reference comparison */
export type CurveNames = [string, string];

function curves(r: TwoTraces, extras: Trace[], y: (t: Trace) => number[], width: number, names?: CurveNames) {
  return [
    { x: r.baseline.freq, y: y(r.baseline), name: names?.[0] ?? `Baseline ${sessionLabel(r.baseline)}`, mode: "lines",
      line: { color: BASELINE_COLOR, width } },
    { x: r.test.freq, y: y(r.test), name: names?.[1] ?? `Lần đo ${sessionLabel(r.test)}`, mode: "lines",
      line: { color: TEST_COLOR, width, dash: "dash" } },
    ...extras.map((t, i) => ({
      x: t.freq, y: y(t), name: `${sessionLabel(t)} ${t.label}`, mode: "lines",
      line: { width: 1.2, color: EXTRA_COLORS[i % EXTRA_COLORS.length] },
    })),
  ];
}

export function magnitudeFigure(r: TwoTraces, std: Standards, extras: Trace[] = [], names?: CurveNames, opt: PlotOptions = {}): Figure {
  return {
    data: curves(r, extras, (t) => t.magDb, 1.6, names),
    layout: {
      xaxis: xAxisOf(opt), yaxis: { title: { text: "Biên độ (dB)" }, gridcolor: "#e3e7eb" },
      ...backdrop(std, opt, ...span([r.baseline, r.test, ...extras])),
    },
  };
}

export function phaseFigure(r: TwoTraces, std: Standards, extras: Trace[] = [], names?: CurveNames, opt: PlotOptions = {}): Figure {
  return {
    data: curves(r, extras, (t) => t.phaseDeg, 1.4, names),
    layout: {
      xaxis: xAxisOf(opt), yaxis: { title: { text: "Góc pha (°)" }, range: [-185, 185], dtick: 45, gridcolor: "#e3e7eb" },
      ...backdrop(std, opt, ...span([r.baseline, r.test, ...extras])),
    },
  };
}

/**
 * Magnitude above phase on one shared frequency axis, so zooming one zooms both.
 * Peak markers, when given, go on the magnitude row.
 */
export function bodeFigure(
  r: TwoTraces, std: Standards, extras: Trace[] = [], names?: CurveNames, markers: Record<string, unknown>[] = [], opt: PlotOptions = {},
): Figure {
  const mag = curves(r, extras, (t) => t.magDb, 1.6, names).map((c) => ({ ...c, legendgroup: c.name, yaxis: "y" }));
  const phase = curves(r, extras, (t) => t.phaseDeg, 1.4, names).map((c) => ({ ...c, legendgroup: c.name, showlegend: false, yaxis: "y2" }));
  return {
    data: [...mag, ...markers.map((m) => ({ ...m, yaxis: "y" })), ...phase],
    layout: {
      xaxis: { ...xAxisOf(opt), anchor: "y2" },
      yaxis: { title: { text: "Biên độ (dB)" }, gridcolor: "#e3e7eb", domain: [0.53, 1] },
      yaxis2: { title: { text: "Góc pha (°)" }, range: [-185, 185], dtick: 90, gridcolor: "#e3e7eb", domain: [0, 0.45] },
      ...backdrop(std, { ...opt, labelRows: opt.labelRows ?? (opt.backdrop === "iec" ? [0.995, 0.445] : [0.995]) }, ...span([r.baseline, r.test, ...extras])),
    },
  };
}

export function diffFigure(r: Pick<PairResult, "aligned">, std: Standards, opt: PlotOptions = {}): Figure {
  const a = r.aligned;
  return {
    data: [{ x: a.freq, y: a.yDb.map((v, i) => v - a.xDb[i]), name: "ΔdB = Y − X", mode: "lines", line: { color: "#44515e", width: 1.2 } }],
    layout: {
      xaxis: xAxisOf(opt),
      yaxis: { title: { text: "ΔdB (lần đo − baseline)" }, zeroline: true, zerolinecolor: "#8b959e", gridcolor: "#e3e7eb" },
      ...backdrop(std, opt, a.freq[0], a.freq[a.freq.length - 1]), showlegend: false,
    },
  };
}

/** Marker traces for detected peaks / notches; flagged shifts and lost/new extrema drawn larger. */
export function peakMarkers(pa: PeakAnalysis, names: CurveNames = ["baseline", "lần đo"]): Record<string, unknown>[] {
  const flagged = new Set(pa.matches.filter((m) => m.status !== "ok").flatMap((m) => [m.ref, m.test]).filter(Boolean));
  const trace = (list: Extremum[], name: string, color: string) => ({
    x: list.map((e) => e.freq), y: list.map((e) => e.db), name, mode: "markers", hoverinfo: "x+y+name",
    marker: {
      color, symbol: list.map((e) => (e.kind === "peak" ? "triangle-up" : "triangle-down")),
      size: list.map((e) => (flagged.has(e) ? 11 : 6)), line: { width: list.map((e) => (flagged.has(e) ? 1.5 : 0)), color: "#111827" },
    },
  });
  return [trace(pa.ref, `Đỉnh/hố ${names[0]}`, BASELINE_COLOR), trace(pa.test, `Đỉnh/hố ${names[1]}`, TEST_COLOR)];
}

/** Layout overrides for static images in the report (print fonts, white background). */
export const REPORT_LAYOUT = {
  font: { family: "Times New Roman, serif", size: 17, color: "#111827" },
  paper_bgcolor: "#ffffff",
  plot_bgcolor: "#ffffff",
  margin: { l: 70, r: 20, t: 40, b: 56 },
  legend: { orientation: "h", y: 1.13, x: 0 },
  showlegend: true,
};
