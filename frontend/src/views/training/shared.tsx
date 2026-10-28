/** Pieces shared by the training tabs: the comparison plot and the app's own analysis of a pair. */
import { useMemo, useState } from "react";
import { bodeFigure, diffFigure, peakMarkers, type Backdrop, type CurveNames, type PlotOptions } from "../../charts/figures";
import Plot from "../../components/Plot";
import { PlotPanel, useLineWidth } from "../../components/PlotTools";
import { LevelBadge } from "../../components/common";
import type { PairResult } from "../../core/analysis";
import { fmtHz } from "../../core/quality";
import type { Standards } from "../../core/standards";
import { largestShift } from "../../core/training/score";
export { synthTrace } from "../../core/training/synth";

/** Bode plot of a pair with the plot settings and zone notes, as in the analysis screens */
export function PairPlot({ r, std, names, peaks = false, partition: initial = "iec" }: {
  r: PairResult;
  std: Standards;
  names: CurveNames;
  /** peak markers shown at first */
  peaks?: boolean;
  partition?: string;
}) {
  const [partition, setPartition] = useState<Backdrop>(initial);
  const [showPartition, setShowPartition] = useState(true);
  const [scale, setScale] = useState<"log" | "linear">("log");
  const [lineWidth, setLineWidth] = useLineWidth();
  const [showPeaks, setShowPeaks] = useState(peaks);
  const [xRange, setXRange] = useState<[number, number] | null>(null);
  const [hoverF, setHoverF] = useState<number | null>(null);
  const [fit, setFit] = useState(0);
  const backdrop: Backdrop = showPartition ? partition : "none";
  const figs = useMemo(() => {
    const opt: PlotOptions = { backdrop, scale, lineWidth, xRange: xRange ?? undefined };
    return {
      bode: bodeFigure(r, std, [], names, showPeaks ? peakMarkers(r.peaks, names) : [], opt),
      diff: diffFigure(r, std, opt),
    };
  }, [r, std, names, backdrop, scale, lineWidth, xRange, showPeaks]);
  const span: [number, number] = [r.aligned.freq[0], r.aligned.freq[r.aligned.freq.length - 1]];
  return (
    <PlotPanel
      hoverF={hoverF}
      tools={{
        std,
        partition,
        onPartition: setPartition,
        showPartition,
        onShowPartition: setShowPartition,
        scale,
        onScale: setScale,
        lineWidth,
        onLineWidth: setLineWidth,
        showPeaks,
        onShowPeaks: setShowPeaks,
        onFit: () => {
          setXRange(null);
          setFit((n) => n + 1);
        },
        xRange: xRange ?? undefined,
        onXRange: setXRange,
        span,
      }}
    >
      <Plot key={`b${fit}`} data={figs.bode.data} layout={figs.bode.layout} height={560} onHoverX={setHoverF} onXRange={setXRange} />
      <h3>Hiệu số biên độ ΔdB</h3>
      <Plot key={`d${fit}`} data={figs.diff.data} layout={figs.diff.layout} height={220} onHoverX={setHoverF} onXRange={setXRange} />
    </PlotPanel>
  );
}

/** Rxy per DL/T 911 band, the level it points to, and the resonance that moved most */
export function AppAnalysis({ r, std }: { r: PairResult; std: Standards }) {
  const shift = largestShift(r.peaks);
  return (
    <div className="app-analysis">
      <p>
        <LevelBadge c={r.classification} />{" "}
        {Object.values(r.bands)
          .map((b) => `R${b.band} = ${b.rxy === null ? "–" : b.rxy.toFixed(2)}`)
          .join("; ")}
        .
      </p>
      <p className="muted small">Căn cứ: {std.dlt911.classification.source}.</p>
      {shift ? (
        <p>
          Cộng hưởng dịch nhiều nhất: {shift.kind === "peak" ? "đỉnh" : "hố"} {fmtHz(shift.ref!.freq)} → {fmtHz(shift.test!.freq)} (
          {shift.shiftPercent! > 0 ? "+" : ""}
          {shift.shiftPercent!.toFixed(1)} %).
        </p>
      ) : (
        <p className="muted">Không có cộng hưởng nào ghép được ở cả hai đường mà bị dịch.</p>
      )}
    </div>
  );
}

export const Source = ({ children }: { children: string }) => <span className="src">Nguồn: {children}</span>;
