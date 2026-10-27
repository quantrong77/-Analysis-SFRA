import { useState, type ReactNode } from "react";
import { fmtHz } from "../core/quality";
import { partitionFills } from "../charts/figures";
import { fmtHzShort } from "../core/quality";
import { frequencyPartitions, type Standards } from "../core/standards";
import ZoneInfo from "./ZoneInfo";

interface Props {
  std: Standards;
  /** id of the frequency partition drawn behind the curves */
  partition: string;
  onPartition: (id: string) => void;
  showPartition: boolean;
  onShowPartition: (v: boolean) => void;
  scale: "log" | "linear";
  onScale: (s: "log" | "linear") => void;
  /** Width of the measured curves, in px */
  lineWidth: number;
  onLineWidth: (w: number) => void;
  showPeaks: boolean;
  onShowPeaks: (v: boolean) => void;
  /** Back to the whole frequency range and the default zoom of every axis */
  onFit: () => void;
  /** Frequency range shown (Hz), undefined = whole range */
  xRange?: [number, number];
  onXRange: (r: [number, number] | null) => void;
  /** Frequency span of the measured data (Hz): zones are clipped to it when zoomed to */
  span: [number, number];
  /** Extra line under the key, e.g. what the DL/T 911 band labels mean */
  partitionNote?: string;
  /** Curves on the plot, each with its colour, so the user can pick another one */
  curves?: CurveSwatch[];
  /** New colour of a trace's curve; null goes back to the default colour */
  onColor?: (traceId: string, color: string | null) => void;
}

export interface CurveSwatch {
  id: string;
  name: string;
  color: string;
  dashed?: boolean;
  /** colour chosen by the user (not the default one) */
  custom: boolean;
}

/** Curve widths offered, in px; "Vừa" is the width the plots had before the choice existed */
export const LINE_WIDTHS: { w: number; label: string }[] = [
  { w: 1, label: "Mảnh" },
  { w: 1.6, label: "Vừa" },
  { w: 2.4, label: "Đậm" },
  { w: 3.2, label: "Rất đậm" },
];
export const DEFAULT_LINE_WIDTH = 1.6;

const WIDTH_KEY = "sfra.lineWidth";
/** Curve width chosen by the viewer, remembered in this browser and shared by the plot screens */
export function useLineWidth(): [number, (w: number) => void] {
  const [w, setW] = useState(() => {
    try {
      const v = Number(localStorage.getItem(WIDTH_KEY));
      return LINE_WIDTHS.some((o) => o.w === v) ? v : DEFAULT_LINE_WIDTH;
    } catch {
      return DEFAULT_LINE_WIDTH;
    }
  });
  const set = (v: number) => {
    setW(v);
    try {
      localStorage.setItem(WIDTH_KEY, String(v));
    } catch {
      /* private window: the choice lasts for this page only */
    }
  };
  return [w, set];
}

const range = (lo: number, hi: number) =>
  lo <= 0 ? `dưới ${fmtHzShort(hi)}` : Number.isFinite(hi) ? `${fmtHzShort(lo)} – ${fmtHzShort(hi)}` : `trên ${fmtHzShort(lo)}`;

/**
 * Plot settings, one labelled row each: frequency partition and the reference document it follows,
 * frequency axis, curve width, peak markers, curve colours, reset zoom.
 */
export default function PlotTools(p: Props) {
  const partitions = frequencyPartitions(p.std);
  const current = partitions.find((x) => x.id === p.partition) ?? partitions[0];
  const fills = current ? partitionFills(p.std, current.id) : [];
  return (
    <div className="plot-settings" role="group" aria-labelledby="plot-settings-title">
      <div className="plot-settings-head">
        <h3 id="plot-settings-title">Cài đặt đồ thị</h3>
        <button onClick={p.onFit}>Vừa khung</button>
      </div>
      <dl className="settings-rows">
        <dt>Phân vùng tần số</dt>
        <dd>
          <div className="partition-pick">
            <label className="check">
              <input type="checkbox" checked={p.showPartition} onChange={(e) => p.onShowPartition(e.target.checked)} /> Hiện
            </label>
            <select
              aria-label="Phân vùng theo tài liệu"
              value={current?.id ?? ""}
              disabled={!p.showPartition}
              onChange={(e) => p.onPartition(e.target.value)}
            >
              {partitions.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          {p.showPartition && current && (
            <>
              <ul className="zone-key" aria-label={`Phân vùng tần số: ${current.label}`}>
                {current.zones.map((z, i) => (
                  <li key={z.key}>
                    <span className="zone-swatch" style={{ background: fills[i] }} aria-hidden="true" />
                    <strong>{z.label}</strong> <span className="muted">{range(z.f_min, z.f_max)}</span>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                Căn cứ: {current.source}. {p.std.frequency_partitions?.note ?? ""}
                {p.std.frequency_partitions?.note ? ". " : ""}
                {p.partitionNote}
              </p>
            </>
          )}
        </dd>

        <dt>Trục tần số</dt>
        <dd>
          <div className="seg" role="radiogroup" aria-label="Trục tần số">
            {(["log", "linear"] as const).map((s) => (
              <button key={s} role="radio" aria-checked={p.scale === s} className={p.scale === s ? "on" : ""} onClick={() => p.onScale(s)}>
                {s === "log" ? "Log" : "Tuyến tính"}
              </button>
            ))}
          </div>
        </dd>

        <dt>Độ dày nét</dt>
        <dd>
          <div className="seg" role="radiogroup" aria-label="Độ dày nét đường đo">
            {LINE_WIDTHS.map((o) => (
              <button
                key={o.w}
                role="radio"
                aria-checked={p.lineWidth === o.w}
                className={p.lineWidth === o.w ? "on" : ""}
                title={`${o.w} px`}
                onClick={() => p.onLineWidth(o.w)}
              >
                <span className="width-sample" style={{ borderTopWidth: Math.max(1, Math.round(o.w)) }} aria-hidden="true" />
                {o.label}
              </button>
            ))}
          </div>
        </dd>

        <dt>Zoom vùng</dt>
        <dd>
          <ZoomControls p={p} zones={current?.zones ?? []} />
        </dd>

        <dt>Đỉnh/hố</dt>
        <dd>
          <label className="check">
            <input type="checkbox" checked={p.showPeaks} onChange={(e) => p.onShowPeaks(e.target.checked)} /> Đánh dấu đỉnh và hố cộng hưởng
          </label>
        </dd>

        {p.curves && p.curves.length > 0 && (
          <>
            <dt>Màu đường đo</dt>
            <dd>
              <div className="curve-colors" role="group" aria-label="Màu đường đo">
                {p.curves.map((c) => (
                  <span key={c.id} className="curve-color">
                    <label title="Bấm để chọn màu">
                      <input
                        type="color"
                        value={c.color}
                        aria-label={`Màu của đường ${c.name}`}
                        onChange={(e) => p.onColor?.(c.id, e.target.value)}
                      />
                      <span className={c.dashed ? "curve-key test" : "curve-key base"} style={{ borderTopColor: c.color }} aria-hidden="true" />
                      {c.name}
                    </label>
                    {c.custom && (
                      <button type="button" className="link" onClick={() => p.onColor?.(c.id, null)}>
                        Mặc định
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </dd>
          </>
        )}
      </dl>
      <p className="muted small settings-foot">
        Biên độ (trên) và góc pha (dưới) chung trục tần số: kéo chọn một vùng để phóng to cả hai.
        {p.showPeaks && <> Đỉnh/hố: ▲ đỉnh, ▼ hố; ký hiệu lớn là dịch ≥ ngưỡng, mất hoặc mới.</>}
      </p>
    </div>
  );
}

/** Zoom to a region of the current partition, to a typed range, or back to the whole range. */
function ZoomControls({ p, zones }: { p: Props; zones: { key: string; label: string; f_min: number; f_max: number }[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lo, hi] = p.span;
  const clip = (z: { f_min: number; f_max: number }): [number, number] | null => {
    const a = Math.max(z.f_min, lo);
    const b = Math.min(z.f_max, hi);
    return b > a ? [a, b] : null;
  };
  const kHz = (s: string) => Number(s.trim().replace(",", ".")) * 1e3;
  const typed: [number, number] | null = (() => {
    const a = kHz(from);
    const b = kHz(to);
    return from && to && Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > a ? [a, b] : null;
  })();
  return (
    <div className="zoom-controls">
      <div className="zoom-zones">
        {zones.map((z) => {
          const r = clip(z);
          const on = Boolean(r && p.xRange && Math.abs(p.xRange[0] - r[0]) < 1e-6 * r[0] && Math.abs(p.xRange[1] - r[1]) < 1e-6 * r[1]);
          return (
            <button key={z.key} type="button" className={on ? "chip on" : "chip"} disabled={!r} title={z.label} onClick={() => r && p.onXRange(r)}>
              {z.key.length <= 3 ? z.key : z.label}
            </button>
          );
        })}
        <button type="button" className={p.xRange ? "chip" : "chip on"} onClick={() => p.onXRange(null)}>
          Toàn dải
        </button>
      </div>
      <form
        className="zoom-range"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed) p.onXRange(typed);
        }}
      >
        <label>
          Từ <input inputMode="decimal" aria-label="Tần số đầu (kHz)" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="1" />
        </label>
        <label>
          đến <input inputMode="decimal" aria-label="Tần số cuối (kHz)" value={to} onChange={(e) => setTo(e.target.value)} placeholder="100" />
        </label>
        <span>kHz</span>
        <button type="submit" disabled={!typed}>
          Zoom
        </button>
      </form>
      <p className="muted small">
        {p.xRange ? `Đang xem ${fmtHz(p.xRange[0])} – ${fmtHz(p.xRange[1])}.` : "Đang xem toàn dải."} Có thể kéo chọn một vùng trên giản đồ để
        zoom; nháy đúp để về toàn dải.
      </p>
    </div>
  );
}

/**
 * The analysis area: plot settings (left) and the influence of the frequency zones (right), two
 * columns of the same height, above the plots, all in one frame.
 */
export function PlotPanel({ tools, hoverF, children }: { tools: Props; hoverF: number | null; children: ReactNode }) {
  return (
    <section className="analysis-frame" aria-label="Phân tích giản đồ">
      <div className="plot-head">
        <PlotTools {...tools} />
        <div className="zone-col">
          <ZoneInfo std={tools.std} freq={hoverF} />
        </div>
      </div>
      <div className="plot-stage">{children}</div>
    </section>
  );
}
