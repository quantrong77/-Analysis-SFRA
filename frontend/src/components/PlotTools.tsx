import { partitionFills } from "../charts/figures";
import { fmtHzShort } from "../core/quality";
import { frequencyPartitions, type Standards } from "../core/standards";

interface Props {
  std: Standards;
  /** id of the frequency partition drawn behind the curves */
  partition: string;
  onPartition: (id: string) => void;
  showPartition: boolean;
  onShowPartition: (v: boolean) => void;
  scale: "log" | "linear";
  onScale: (s: "log" | "linear") => void;
  showPeaks: boolean;
  onShowPeaks: (v: boolean) => void;
  onFit: () => void;
  /** Extra line under the key, e.g. what the DL/T 911 band labels mean */
  partitionNote?: string;
}

const range = (lo: number, hi: number) =>
  lo <= 0 ? `dưới ${fmtHzShort(hi)}` : Number.isFinite(hi) ? `${fmtHzShort(lo)} – ${fmtHzShort(hi)}` : `trên ${fmtHzShort(lo)}`;

/**
 * Toolbar above the Bode plots: frequency partition on or off and which reference document it
 * follows, frequency axis, peak markers, reset zoom; key of the partition's regions below it.
 */
export default function PlotTools(p: Props) {
  const partitions = frequencyPartitions(p.std);
  const current = partitions.find((x) => x.id === p.partition) ?? partitions[0];
  const fills = current ? partitionFills(p.std, current.id) : [];
  return (
    <>
      <div className="plot-tools" role="toolbar" aria-label="Tùy chọn giản đồ">
        <div className="partition-pick">
          <label className="check">
            <input type="checkbox" checked={p.showPartition} onChange={(e) => p.onShowPartition(e.target.checked)} /> Phân vùng tần số
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
        <div className="seg" role="radiogroup" aria-label="Trục tần số">
          <span className="seg-label">Trục tần số</span>
          {(["log", "linear"] as const).map((s) => (
            <button key={s} role="radio" aria-checked={p.scale === s} className={p.scale === s ? "on" : ""} onClick={() => p.onScale(s)}>
              {s === "log" ? "Log" : "Tuyến tính"}
            </button>
          ))}
        </div>
        <label className="check small">
          <input type="checkbox" checked={p.showPeaks} onChange={(e) => p.onShowPeaks(e.target.checked)} /> Đỉnh/hố
        </label>
        <button onClick={p.onFit}>Vừa khung</button>
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
      <p className="muted small">
        Biên độ (trên) và góc pha (dưới) chung trục tần số: kéo chọn một vùng để phóng to cả hai.
        {p.showPeaks && <> Đỉnh/hố: ▲ đỉnh, ▼ hố; ký hiệu lớn là dịch ≥ ngưỡng, mất hoặc mới.</>}
      </p>
    </>
  );
}
