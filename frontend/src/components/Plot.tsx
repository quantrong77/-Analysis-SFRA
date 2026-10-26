import { useEffect, useRef } from "react";
import Plotly from "plotly.js-basic-dist-min";

interface Props {
  data: unknown[];
  layout: Record<string, unknown>;
  height?: number;
  /** Frequency (x value) under the mouse, while it moves over the plot */
  onHoverX?: (x: number) => void;
}

type PlotlyEl = { on: (ev: string, fn: (e: { points?: { x: unknown }[] }) => void) => void };

const BASE_LAYOUT = {
  margin: { l: 64, r: 18, t: 30, b: 50 },
  font: { family: "Barlow, Segoe UI, system-ui, sans-serif", size: 13, color: "#1b2733" },
  hoverlabel: { font: { family: "Barlow, Segoe UI, sans-serif", size: 13 }, bordercolor: "#b9c1c9" },
  paper_bgcolor: "#ffffff",
  plot_bgcolor: "#ffffff",
  legend: { orientation: "h", y: 1.12, x: 0 },
  hovermode: "x unified",
};

export default function Plot({ data, layout, height = 340, onHoverX }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // the listener is attached once; it calls whatever callback the latest render passed
  const hover = useRef(onHoverX);
  hover.current = onHoverX;
  const bound = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Plotly writes zoom ranges into the layout it is given: pass a copy so the caller's figure stays as built
    const drawn = Plotly.react(el, data, structuredClone({ ...BASE_LAYOUT, ...layout, height }), {
      responsive: true,
      displaylogo: false,
      locale: "vi",
      modeBarButtonsToRemove: ["select2d", "lasso2d"],
      toImageButtonOptions: { format: "png", scale: 2 },
    });
    // Plotly gives the element its event methods when it first draws: listen once after that
    void drawn.then(() => {
      if (bound.current) return;
      bound.current = true;
      (el as unknown as PlotlyEl).on("plotly_hover", (e) => {
        const x = Number(e.points?.[0]?.x);
        if (Number.isFinite(x)) hover.current?.(x);
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
