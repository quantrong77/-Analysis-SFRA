import { useEffect, useRef } from "react";
import Plotly from "plotly.js-basic-dist-min";

interface Props {
  data: unknown[];
  layout: Record<string, unknown>;
  height?: number;
  /** Frequency (x value) under the mouse, while it moves over the plot */
  onHoverX?: (x: number) => void;
  /** Frequency range after the user zoomed or panned in the plot, in Hz; null when back to the whole range */
  onXRange?: (range: [number, number] | null) => void;
}

type PlotlyEl = {
  on(ev: "plotly_hover", fn: (e: { points?: { x: unknown }[] }) => void): void;
  on(ev: "plotly_relayout", fn: (e: Record<string, unknown>) => void): void;
  layout?: { xaxis?: { type?: string } };
};

/** x range of a relayout event, in Hz; null when the axis went back to autorange; undefined when x did not change */
function relayoutRange(e: Record<string, unknown>, log: boolean): [number, number] | null | undefined {
  if (e["xaxis.autorange"]) return null;
  const pair = (e["xaxis.range"] as number[] | undefined) ?? [e["xaxis.range[0]"], e["xaxis.range[1]"]];
  const [a, b] = pair.map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return log ? [10 ** a, 10 ** b] : [a, b];
}

const BASE_LAYOUT = {
  margin: { l: 64, r: 18, t: 30, b: 50 },
  font: { family: "Barlow, Segoe UI, system-ui, sans-serif", size: 13, color: "#1b2733" },
  hoverlabel: { font: { family: "Barlow, Segoe UI, sans-serif", size: 13 }, bordercolor: "#b9c1c9" },
  paper_bgcolor: "#ffffff",
  plot_bgcolor: "#ffffff",
  legend: { orientation: "h", y: 1.12, x: 0 },
  hovermode: "x unified",
};

export default function Plot({ data, layout, height = 340, onHoverX, onXRange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // the listener is attached once; it calls whatever callback the latest render passed
  const hover = useRef(onHoverX);
  hover.current = onHoverX;
  const zoom = useRef(onXRange);
  zoom.current = onXRange;
  const bound = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Plotly writes zoom ranges into the layout it is given: pass a copy so the caller's figure stays as built
    const drawn = Plotly.react(el, data, structuredClone({ ...BASE_LAYOUT, ...layout, height }), {
      responsive: true,
      displaylogo: false,
      // Plotly's own hints are in English; the zoom row of the plot settings explains the gestures
      showTips: false,
      locale: "vi",
      modeBarButtonsToRemove: ["select2d", "lasso2d"],
      toImageButtonOptions: { format: "png", scale: 2 },
    });
    // Plotly gives the element its event methods when it first draws: listen once after that
    void drawn.then(() => {
      if (bound.current) return;
      bound.current = true;
      const pel = el as unknown as PlotlyEl;
      pel.on("plotly_hover", (e) => {
        const x = Number(e.points?.[0]?.x);
        if (Number.isFinite(x)) hover.current?.(x);
      });
      // box zoom, pan or double-click reset in this plot: the other plots follow
      pel.on("plotly_relayout", (e) => {
        const r = relayoutRange(e, pel.layout?.xaxis?.type === "log");
        if (r !== undefined) zoom.current?.(r);
      });
    });
  }, [data, layout, height]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => Plotly.Plots.resize(el));
    ro.observe(el);
    return () => {
      ro.disconnect();
      Plotly.purge(el);
    };
  }, []);

  return <div ref={ref} className="plot" style={{ height }} />;
}
