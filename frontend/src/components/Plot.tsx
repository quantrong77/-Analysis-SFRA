import { useEffect, useRef } from "react";
import Plotly from "plotly.js-basic-dist-min";

interface Props {
  data: unknown[];
  layout: Record<string, unknown>;
  height?: number;
}

const BASE_LAYOUT = {
  margin: { l: 64, r: 16, t: 28, b: 48 },
  font: { family: "Segoe UI, system-ui, sans-serif", size: 12, color: "#1f2937" },
  paper_bgcolor: "#ffffff",
  plot_bgcolor: "#ffffff",
  legend: { orientation: "h", y: 1.12, x: 0 },
  hovermode: "x unified",
};

export default function Plot({ data, layout, height = 340 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    void Plotly.react(el, data, { ...BASE_LAYOUT, ...layout, height }, {
      responsive: true,
      displaylogo: false,
      locale: "vi",
      modeBarButtonsToRemove: ["select2d", "lasso2d"],
      toImageButtonOptions: { format: "png", scale: 2 },
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
