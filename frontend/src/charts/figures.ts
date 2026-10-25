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
  LF: "rgba(59,130,246,0.07)",
  MF: "rgba(16,185,129,0.08)",
  HF: "rgba(245,158,11,0.09)",
};
export const BASELINE_COLOR = "#1d4ed8";
export const TEST_COLOR = "#dc2626";
const EXTRA_COLORS = ["#7c3aed", "#059669", "#d97706", "#0891b2", "#db2777", "#4b5563"];

const sessionLabel = (t: Trace) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey(t.testDate));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "?";
};

// On a log axis Plotly takes shape x in data units but annotation x in log10 units.
function bandShapes(std: Standards) {
  return Object.entries(std.dlt911.bands).map(([k, b]) => ({
    type: "rect", xref: "x", yref: "paper", x0: b.f_min, x1: b.f_max, y0: 0, y1: 1,
    fillcolor: BAND_FILL[k] ?? "rgba(0,0,0,0.04)", line: { width: 0 }, layer: "below",
  }));
}

function bandAnnotations(std: Standards) {
  return Object.entries(std.dlt911.bands).map(([k, b]) => ({
    xref: "x", yref: "paper", x: (Math.log10(b.f_min) + Math.log10(b.f_max)) / 2, y: 1, yanchor: "bottom",
    text: k, showarrow: false, font: { size: 11, color: "#6b7280" },
  }));
}

const xAxis = {
  type: "log", title: { text: "Tần số (Hz)" }, exponentformat: "SI", gridcolor: "#e5e7eb",
  minor: { showgrid: true, gridcolor: "#f3f4f6" },
};

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

export function magnitudeFigure(r: TwoTraces, std: Standards, extras: Trace[] = [], names?: CurveNames): Figure {
  return {
    data: curves(r, extras, (t) => t.magDb, 1.6, names),
    layout: {
      xaxis: xAxis, yaxis: { title: { text: "Biên độ (dB)" }, gridcolor: "#e5e7eb" },
      shapes: bandShapes(std), annotations: bandAnnotations(std),
    },
  };
}

export function phaseFigure(r: TwoTraces, std: Standards, extras: Trace[] = [], names?: CurveNames): Figure {
  return {
    data: curves(r, extras, (t) => t.phaseDeg, 1.4, names),
    layout: {
      xaxis: xAxis, yaxis: { title: { text: "Góc pha (°)" }, range: [-185, 185], dtick: 45, gridcolor: "#e5e7eb" },
      shapes: bandShapes(std), annotations: bandAnnotations(std),
    },
  };
}

export function diffFigure(r: Pick<PairResult, "aligned">, std: Standards): Figure {
  const a = r.aligned;
  return {
    data: [{ x: a.freq, y: a.yDb.map((v, i) => v - a.xDb[i]), name: "ΔdB = Y − X", mode: "lines", line: { color: "#374151", width: 1.2 } }],
    layout: {
      xaxis: xAxis,
      yaxis: { title: { text: "ΔdB (lần đo − baseline)" }, zeroline: true, zerolinecolor: "#9ca3af", gridcolor: "#e5e7eb" },
      shapes: bandShapes(std), annotations: bandAnnotations(std), showlegend: false,
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
