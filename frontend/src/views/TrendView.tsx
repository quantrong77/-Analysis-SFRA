import { useMemo, useState } from "react";
import Plot from "../components/Plot";
import { InternalTag, LevelBadge } from "../components/common";
import type { TransformerGroup } from "../core/pairing";
import type { GridMode } from "../core/resample";
import { fmtNum } from "../core/rules";
import type { Standards } from "../core/standards";
import { computeTrend, type TrendSeries } from "../core/trend";
import type { Trace } from "../core/types";
import { sessionLabel } from "../workspace";

interface Props {
  std: Standards;
  group: TransformerGroup;
  traces: Trace[];
  mode: GridMode;
}

const BAND_COLORS: Record<string, string> = { LF: "#1e4e79", MF: "#2e7d4f", HF: "#8f6a00" };

function TrendBadge({ s }: { s: TrendSeries }) {
  return <span className={`badge trend-${s.status.id}`}>{s.status.label}</span>;
}

export default function TrendView({ std, group, traces, mode }: Props) {
  const tr = useMemo(
    () => computeTrend(traces.filter((t) => t.transformerKey === group.key), group.baselineSession, std, mode),
    [traces, group.key, group.baselineSession, std, mode],
  );
  const [sel, setSel] = useState<string | null>(null);
  const cur = tr.series.find((s) => s.key === sel) ?? tr.series.find((s) => s.status.id === "warning") ?? tr.series[0];
  const later = tr.sessions.filter((s) => s !== tr.baselineSession);
  const bands = Object.keys(std.dlt911.bands);

  const fig = useMemo(() => {
    if (!cur) return null;
    const pts = cur.points.filter((p) => p.result);
    const x = pts.map((p) => p.session);
    const data = bands.map((b) => ({
      x, y: pts.map((p) => p.result!.bands[b].rxy), name: `R${b}`, mode: "lines+markers",
      line: { color: BAND_COLORS[b], width: 2 }, marker: { size: 8 },
    }));
    const shapes = bands.map((b) => ({
      type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: std.dlt911.bands[b].threshold, y1: std.dlt911.bands[b].threshold,
      line: { color: BAND_COLORS[b], width: 1, dash: "dot" },
    }));
    const annotations = bands.map((b) => ({
      xref: "paper", x: 1, xanchor: "right", yref: "y", y: std.dlt911.bands[b].threshold, yanchor: "bottom",
      text: `ngưỡng R${b} ${fmtNum(std.dlt911.bands[b].threshold, std, 1)}`, showarrow: false, font: { size: 11, color: BAND_COLORS[b] },
    }));
    return {
      data,
      layout: {
        xaxis: { type: "date", title: { text: "Kỳ đo" }, tickformat: "%d/%m/%Y", gridcolor: "#e3e7eb" },
        yaxis: { title: { text: "Rxy so với baseline" }, rangemode: "tozero", gridcolor: "#e3e7eb" },
        shapes, annotations, hovermode: "x unified",
      },
    };
  }, [cur, bands, std]);

  const counts = {
    warning: tr.series.filter((s) => s.status.id === "warning").length,
    stable: tr.series.filter((s) => s.status.id === "stable").length,
    insufficient: tr.series.filter((s) => s.status.id === "insufficient").length,
  };

  return (
    <div className="view">
      <header className="view-head">
        <h1>Xu hướng</h1>
        <p className="lede">
          {tr.sessions.length} kỳ đo. Rxy của mỗi kỳ tính so với baseline {sessionLabel(tr.baselineSession)}, mọi kỳ dùng chung chế
          độ căn lưới {tr.mode}.
        </p>
      </header>

      <section className="panel">
        <p>
          Rxy của mỗi kỳ luôn tính so với baseline {sessionLabel(tr.baselineSession)} (không so với kỳ liền trước), mọi kỳ cùng chế độ
          căn lưới {tr.mode}. Mức độ từng kỳ theo {std.dlt911.classification.source}.
        </p>
        <p className="small">
          Quy tắc xu hướng: cần ít nhất {std.trend.min_sessions} kỳ đo (kể cả baseline); cảnh báo khi{" "}
          {(std.trend.bands_checked as string[]).map((b) => `R${b}`).join(" hoặc ")} giảm hơn{" "}
          {fmtNum(std.trend.rmf_rhf_drop_ratio * 100, std, 0)} % so với kỳ đầu tiên có Rxy. <InternalTag />{" "}
          <span className="muted">{std.trend.source.replace(/^Ngưỡng nội bộ \(cấu hình được\),?\s*/, "Nguồn: ")}</span>
        </p>
        <div className="row gap wrap small">
          <span className="badge trend-warning">{counts.warning} cảnh báo</span>
          <span className="badge trend-stable">{counts.stable} không suy giảm</span>
          <span className="badge trend-insufficient">{counts.insufficient} chưa đủ dữ liệu</span>
        </div>
      </section>

      <div className="table-wrap">
        <table className="grid results">
          <thead>
            <tr>
              <th>STT</th>
              <th>Phép đo</th>
              {later.map((s) => (
                <th key={s}>
                  {sessionLabel(s)}
                  <div className="th-sub">RLF / RMF / RHF</div>
                </th>
              ))}
              <th>Xu hướng</th>
            </tr>
          </thead>
          <tbody>
            {tr.series.map((s) => (
              <tr key={s.key} className={`clickable${cur?.key === s.key ? " selected" : ""}`} onClick={() => setSel(s.key)}>
                <td className="num">{s.index ?? "–"}</td>
                <td>
                  <strong>{s.label}</strong>
                </td>
                {later.map((ses) => {
                  const p = s.points.find((x) => x.session === ses);
                  if (!p) return <td key={ses} className="muted">–</td>;
                  if (!p.result) return <td key={ses} className="err small">{p.error}</td>;
                  return (
                    <td key={ses} className="nowrap">
                      <span className="mono-num">{bands.map((b) => fmtNum(p.result!.bands[b].rxy, std)).join(" / ")}</span>{" "}
                      <LevelBadge c={p.result.classification} />
                    </td>
                  );
                })}
                <td>
                  <TrendBadge s={s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cur && fig && (
        <section className="panel">
          <div className="row between wrap">
            <h2>
              Phép đo {cur.index ?? ""} · {cur.label}
            </h2>
            <TrendBadge s={cur} />
          </div>
          <ul className="warns">
            {cur.status.messages.map((m, i) => (
              <li key={i} className={cur.status.id === "warning" ? "warning" : ""}>
                {m}
              </li>
            ))}
          </ul>
          <Plot data={fig.data} layout={fig.layout} height={340} />
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Ngày</th>
                  {bands.map((b) => (
                    <th key={b} className="num">
                      R{b}
                    </th>
                  ))}
                  <th>Phân loại (DL/T 911 Bảng A.1)</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                <tr className="dim">
                  <td>{sessionLabel(tr.baselineSession)} (baseline)</td>
                  {bands.map((b) => (
                    <td key={b} className="num">–</td>
                  ))}
                  <td>–</td>
                  <td>
                    <code>{cur.baseline?.sourceName ?? "Không có"}</code>
                  </td>
                </tr>
                {cur.points.map((p) => (
                  <tr key={p.session}>
                    <td>{sessionLabel(p.session)}</td>
                    {bands.map((b) => {
                      const br = p.result?.bands[b];
                      return (
                        <td key={b} className={`num${br && br.rxy !== null && br.rxy < br.threshold ? " below" : ""}`}>
                          {fmtNum(br?.rxy, std)}
                        </td>
                      );
                    })}
                    <td>{p.result ? <LevelBadge c={p.result.classification} /> : <span className="err">{p.error}</span>}</td>
                    <td>
                      <code>{p.trace.sourceName}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
