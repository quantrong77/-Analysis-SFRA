import type { Backdrop } from "../charts/figures";
import { zoneFill } from "../charts/figures";
import { fmtHzShort } from "../core/quality";
import type { Standards } from "../core/standards";

const BACKDROPS: { id: Backdrop; label: string }[] = [
  { id: "dlt911", label: "Dải DL/T 911" },
  { id: "iec", label: "Vùng ảnh hưởng (IEC)" },
  { id: "none", label: "Không" },
];

interface Props {
  std: Standards;
  backdrop: Backdrop;
  onBackdrop: (b: Backdrop) => void;
  scale: "log" | "linear";
  onScale: (s: "log" | "linear") => void;
  showPeaks: boolean;
  onShowPeaks: (v: boolean) => void;
  onFit: () => void;
}

/** Toolbar above the Bode plots: backdrop, frequency axis, peak markers, reset zoom; key of the zones below it. */
export default function PlotTools({ std, backdrop, onBackdrop, scale, onScale, showPeaks, onShowPeaks, onFit }: Props) {
  const zones = Object.entries(std.iec_zones.zones as Record<string, { label: string; f_min: number; f_max: number }>);
  const range = (lo: number, hi: number) =>
    lo <= 0 ? `dưới ${fmtHzShort(hi)}` : Number.isFinite(hi) ? `${fmtHzShort(lo)} – ${fmtHzShort(hi)}` : `trên ${fmtHzShort(lo)}`;
  return (
    <>
      <div className="plot-tools" role="toolbar" aria-label="Tùy chọn giản đồ">
        <div className="seg" role="radiogroup" aria-label="Nền giản đồ">
          <span className="seg-label">Nền</span>
          {BACKDROPS.map((b) => (
            <button key={b.id} role="radio" aria-checked={backdrop === b.id} className={backdrop === b.id ? "on" : ""} onClick={() => onBackdrop(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
        <div className="seg" role="radiogroup" aria-label="Trục tần số">
          <span className="seg-label">Trục tần số</span>
          {(["log", "linear"] as const).map((s) => (
            <button key={s} role="radio" aria-checked={scale === s} className={scale === s ? "on" : ""} onClick={() => onScale(s)}>
              {s === "log" ? "Log" : "Tuyến tính"}
            </button>
          ))}
        </div>
        <label className="check small">
          <input type="checkbox" checked={showPeaks} onChange={(e) => onShowPeaks(e.target.checked)} /> Đỉnh/hố
        </label>
        <button onClick={onFit}>Vừa khung</button>
      </div>
      {backdrop === "iec" && (
        <ul className="zone-key" aria-label="Vùng ảnh hưởng điển hình">
          {zones.map(([k, z]) => (
            <li key={k}>
              <span className="zone-swatch" style={{ background: zoneFill(k) }} aria-hidden="true" />
              <strong>{z.label}</strong> <span className="muted">{range(z.f_min, z.f_max)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        Biên độ (trên) và góc pha (dưới) chung trục tần số: kéo chọn một vùng để phóng to cả hai.{" "}
        {backdrop === "dlt911" && <>Nền: dải LF, MF, HF theo {std.dlt911.source}.</>}
        {backdrop === "iec" && (
          <>
            Nền: vùng ảnh hưởng điển hình theo {std.iec_zones.source}; ranh giới chỉ là ví dụ minh họa, vị trí thực tế phụ thuộc thiết kế
            máy. {std.iec_zones.note}.
          </>
        )}
        {showPeaks && <> Đỉnh/hố: ▲ đỉnh, ▼ hố; ký hiệu lớn là dịch ≥ ngưỡng, mất hoặc mới.</>}
      </p>
    </>
  );
}
