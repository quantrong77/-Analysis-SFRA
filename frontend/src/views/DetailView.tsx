import { useMemo, useState } from "react";
import { diffFigure, magnitudeFigure, peakMarkers, phaseFigure } from "../charts/figures";
import { PeakTable, Tb812Table } from "../components/IndexTables";
import Plot from "../components/Plot";
import { InternalTag, LevelBadge, Warnings } from "../components/common";
import type { PairResult } from "../core/analysis";
import { dayKey, type TransformerGroup } from "../core/pairing";
import { fmtHz } from "../core/quality";
import { fmtNum } from "../core/rules";
import type { Standards } from "../core/standards";
import type { Trace } from "../core/types";
import { fmtDateTime, sessionLabel, type RowResult } from "../workspace";

interface Props {
  std: Standards;
  group: TransformerGroup;
  results: RowResult[];
  rowKey: string;
  traces: Trace[];
  onSelect: (rowKey: string) => void;
}

const shortName = (t: Trace) => `${sessionLabel(dayKey(t.testDate))} ${t.label}`;

export default function DetailView({ std, group, results, rowKey, traces, onSelect }: Props) {
  const [extra, setExtra] = useState<string[]>([]);
  const [showPeaks, setShowPeaks] = useState(true);
  const ok = results.filter((r) => r.result);
  const idx = ok.findIndex((r) => r.row.key === rowKey);
  const rr = ok[idx];
  const r = rr?.result as PairResult | undefined;
  const others = useMemo(
    () => traces.filter((t) => t.transformerKey === group.key && t.id !== r?.baseline.id && t.id !== r?.test.id),
    [traces, group.key, r],
  );

  const plots = useMemo(() => {
    if (!r) return null;
    const extras = extra.map((id) => traces.find((t) => t.id === id)).filter(Boolean) as Trace[];
    const mag = magnitudeFigure(r, std, extras);
    if (showPeaks) mag.data = [...mag.data, ...peakMarkers(r.peaks)];
    return { mag, phase: phaseFigure(r, std, extras), diff: diffFigure(r, std) };
  }, [r, extra, traces, std, showPeaks]);

  if (!r || !plots) return <div className="view"><p>Chưa chọn phép đo.</p></div>;

  const bands = Object.values(r.bands);
  const inBandCount = (lo: number, hi: number) => r.aligned.freq.filter((f) => f >= lo && f <= hi).length;

  return (
    <div className="view">
      <div className="row between wrap">
        <div>
          <h1>
            Phép đo {r.index ?? ""} · {r.label}
          </h1>
          <div className="muted">
            {r.group.label} · MBA {group.key} · Chế độ căn lưới: {r.aligned.modeLabel} ({r.aligned.freq.length} điểm,{" "}
            {fmtHz(r.aligned.fLo)} – {fmtHz(r.aligned.fHi)})
          </div>
        </div>
        <div className="row gap">
          <button disabled={idx <= 0} onClick={() => onSelect(ok[idx - 1].row.key)}>
            ← Trước
          </button>
          <select value={rowKey} onChange={(e) => onSelect(e.target.value)}>
            {ok.map((o) => (
              <option key={o.row.key} value={o.row.key}>
                {o.row.index ?? ""} {o.row.label}
              </option>
            ))}
          </select>
          <button disabled={idx >= ok.length - 1} onClick={() => onSelect(ok[idx + 1].row.key)}>
            Sau →
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="row gap wrap">
          <LevelBadge c={r.classification} />
          <span>
            <strong>Hành động:</strong> {r.action} <InternalTag />
          </span>
        </div>
        {r.classification.note && <p className="note">{r.classification.note}</p>}
        <Warnings items={r.warnings} />
        <div className="files muted small">
          <div>
            Baseline: <code>{r.baseline.sourceName}</code> · {fmtDateTime(r.baseline.testDate)} · {r.baseline.setting.redLead || "–"} →{" "}
            {r.baseline.setting.blackLead || "–"} · {r.baseline.setting.measurementType}
          </div>
          <div>
            Lần đo: <code>{r.test.sourceName}</code> · {fmtDateTime(r.test.testDate)} · {r.test.setting.redLead || "–"} →{" "}
            {r.test.setting.blackLead || "–"} · {r.test.setting.measurementType}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="row between wrap">
          <h3>Giản đồ Bode – biên độ</h3>
          <label className="check small">
            <input type="checkbox" checked={showPeaks} onChange={(e) => setShowPeaks(e.target.checked)} /> Đánh dấu đỉnh/hố (▲ đỉnh, ▼ hố;
            ký hiệu lớn = dịch ≥ ngưỡng, mất hoặc mới)
          </label>
        </div>
        <Plot data={plots.mag.data} layout={plots.mag.layout} height={380} />
        <h3>Giản đồ Bode – góc pha</h3>
        <Plot data={plots.phase.data} layout={plots.phase.layout} height={320} />
        <h3>Hiệu số biên độ ΔdB</h3>
        <Plot data={plots.diff.data} layout={plots.diff.layout} height={260} />
        {others.length > 0 && (
          <details>
            <summary>Thêm đường của kỳ khác hoặc pha khác lên đồ thị ({extra.length} đã chọn)</summary>
            <div className="overlay-list">
              {others.map((t) => (
                <label key={t.id} className="check">
                  <input
                    type="checkbox"
                    checked={extra.includes(t.id)}
                    onChange={(e) => setExtra(e.target.checked ? [...extra, t.id] : extra.filter((x) => x !== t.id))}
                  />
                  {shortName(t)} <span className="muted">({t.sourceName})</span>
                </label>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="panel">
        <h3>Bảng tính trung gian theo DL/T 911-2004, Phụ lục A</h3>
        <p className="muted small">
          X = biên độ baseline (dB), Y = biên độ lần đo (dB) trên cùng tập tần số. X̄ = ΣX/N; Dx = Σ(X−X̄)²/N; Dy =
          Σ(Y−Ȳ)²/N; Cxy = Σ(X−X̄)(Y−Ȳ)/N; LRxy = Cxy/√(Dx·Dy); Rxy = 10 nếu 1−LRxy &lt; 10⁻¹⁰, ngược lại −log₁₀(1−LRxy).
        </p>
        <div className="table-wrap">
          <table className="grid mono">
            <thead>
              <tr>
                <th>Dải</th>
                <th>Điều kiện tần số</th>
                <th className="num">N</th>
                <th className="num">X̄ (dB)</th>
                <th className="num">Ȳ (dB)</th>
                <th className="num">Dx</th>
                <th className="num">Dy</th>
                <th className="num">Cxy</th>
                <th className="num">LRxy</th>
                <th className="num">Rxy</th>
                <th className="num">Ngưỡng</th>
                <th>Căn cứ</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b) => (
                <tr key={b.band}>
                  <td>
                    <strong>{b.band}</strong>
                  </td>
                  <td className="nowrap">
                    {fmtHz(b.f_min)} {b.include_min ? "≤" : "<"} f {b.include_max ? "≤" : "<"} {fmtHz(b.f_max)}
                  </td>
                  <td className="num">{b.n}</td>
                  <td className="num">{fmtNum(b.xMean, std, 4)}</td>
                  <td className="num">{fmtNum(b.yMean, std, 4)}</td>
                  <td className="num">{fmtNum(b.dx, std, 4)}</td>
                  <td className="num">{fmtNum(b.dy, std, 4)}</td>
                  <td className="num">{fmtNum(b.cxy, std, 4)}</td>
                  <td className="num">{fmtNum(b.lrxy, std, 8)}</td>
                  <td className={`num strong${b.rxy !== null && b.rxy < b.threshold ? " below" : ""}`}>{fmtNum(b.rxy, std, 4)}</td>
                  <td className="num">≥ {fmtNum(b.threshold, std, 1)}</td>
                  <td className="muted small">{b.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bands.some((b) => b.note) && <Warnings items={bands.filter((b) => b.note).map((b) => ({ code: "band", severity: "warning", message: `${b.band}: ${b.note}`, source: b.source }))} />}
        <p className="muted small">
          Số điểm trong toàn dải 1 kHz–1 MHz: {inBandCount(1e3, 1e6)}. Phân loại: {r.classification.source}.
        </p>
      </section>

      <section className="panel">
        <h3>Đỉnh cộng hưởng và dịch tần (đặc tả mục 6.4)</h3>
        <PeakTable pa={r.peaks} std={std} />
      </section>

      <section className="panel">
        <h3>Chỉ số CIGRE TB 812 theo dải DL/T 911 (tham khảo)</h3>
        <p className="muted small">
          {std.tb812.source}. {std.tb812.note} {std.tb812.data_size_note}.
        </p>
        <Tb812Table ranges={r.tb812Bands} std={std} />
        <h3>Theo vùng IEC 60076-18 (tham khảo)</h3>
        <p className="muted small">
          {std.iec_zones.source}. {std.iec_zones.note}. Rxy tính theo công thức DL/T 911 Phụ lục A, không áp ngưỡng.
        </p>
        <Tb812Table ranges={r.tb812Zones} std={std} showRxy />
      </section>
    </div>
  );
}
