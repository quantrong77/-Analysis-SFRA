/** Render the Bode figures of each pair to PNG for the report (browser only). */
import Plotly from "plotly.js-basic-dist-min";
import { magnitudeFigure, phaseFigure, REPORT_LAYOUT, type Figure } from "../charts/figures";
import type { PairResult } from "../core/analysis";
import type { Standards } from "../core/standards";
import type { PairImages } from "./docxBuilder";

// ~200 dpi at the 16 cm image width of the report (spec 3.1)
export const IMG_WIDTH = 1260;
export const IMG_HEIGHT = 450; // keeps two charts, the Rxy table and the peak table on one page in most cases

async function png(fig: Figure): Promise<Uint8Array> {
  const url = await Plotly.toImage(
    { data: fig.data, layout: { ...fig.layout, ...REPORT_LAYOUT, width: IMG_WIDTH, height: IMG_HEIGHT } },
    { format: "png", width: IMG_WIDTH, height: IMG_HEIGHT },
  );
  const b64 = url.slice(url.indexOf(",") + 1);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function renderPairImages(
  results: PairResult[], std: Standards, key: (r: PairResult) => string, onProgress: (done: number, total: number) => void,
): Promise<Map<string, PairImages>> {
  const out = new Map<string, PairImages>();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    out.set(key(r), {
      magnitude: await png(magnitudeFigure(r, std)),
      phase: await png(phaseFigure(r, std)),
      width: IMG_WIDTH,
      height: IMG_HEIGHT,
    });
    onProgress(i + 1, results.length);
  }
  return out;
}
