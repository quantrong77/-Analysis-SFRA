import { useMemo, useState } from "react";
import type { TransformerGroup } from "../core/pairing";
import type { GridMode } from "../core/resample";
import { fmtNum, transformerConclusion } from "../core/rules";
import type { Standards } from "../core/standards";
import { InternalTag, LevelBadge, Warnings } from "../components/common";
import { sessionLabel, type RowResult } from "../workspace";

interface Props {
  std: Standards;
  group: TransformerGroup;
  results: RowResult[];
  mode: GridMode;
  onMode: (m: GridMode) => void;
  onOpen: (rowKey: string) => void;
}

export const MODE_OPTIONS: { value: GridMode; label: string }[] = [
  { value: "auto", label: "Tự động (A nếu cùng lưới, ngược lại B)" },
  { value: "A", label: "A – Nguyên bản" },
  { value: "B", label: "B – Theo lưới baseline" },
  { value: "C", label: "C – Lưới log 200 điểm/decade" },
];

export default function ResultsView({ std, group, results, mode, onMode, onOpen }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const ok = results.filter((r) => r.result).map((r) => r.result!);
  const conclusion = useMemo(() => (ok.length ? transformerConclusion(ok, std) : null), [ok, std]);
  const groupsPresent = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of ok) m.set(r.group.id, r.group.label);
    return [...m];
  }, [ok]);
  const shown = results.filter((r) => filter === "all" || r.result?.group.id === filter);
  const bands = Object.keys(std.dlt911.bands);

  return (
    <div className="view">
      <div className="row between wrap">
        <div>
          <h1>Kết quả kỳ đo</h1>
          <div className="muted">
            MBA {group.key} · {group.locations.join(" · ")} · Baseline {sessionLabel(group.baselineSession)} → Lần đo{" "}
            {sessionLabel(group.testSession)}
          </div>
        </div>
        <label>
          Chế độ căn lưới{" "}
          <select value={mode} onChange={(e) => onMode(e.target.value as GridMode)}>
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {conclusion && (
        <section className={`panel conclusion lv-border-${conclusion.worst.id}`}>
          <div className="row gap wrap">
            <span className="muted">Đánh giá chung (mức nặng nhất):</span>
            <LevelBadge c={conclusion.worst} />
          </div>
          <p className="conclusion-text">{conclusion.text}</p>
          <p className="muted small">
            Căn cứ: {std.dlt911.classification.source}. Bộ quy tắc {std.ruleset.id} phiên bản {std.versionTag}. Hành
            động gợi ý: <InternalTag />.
          </p>
        </section>
      )}

      <div className="chips">
        <button className={filter === "all" ? "chip on" : "chip"} onClick={() => setFilter("all")}>
          Tất cả ({results.length})
        </button>
        {groupsPresent.map(([id, label]) => (
          <button key={id} className={filter === id ? "chip on" : "chip"} onClick={() => setFilter(id)}>
            {label} ({ok.filter((r) => r.group.id === id).length})
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="grid results">
          <thead>
            <tr>
              <th>STT</th>
              <th>Phép đo</th>
              <th>Nhóm</th>
              {bands.map((b) => (
                <th key={b} className="num" title={std.dlt911.bands[b].source}>
                  R{b}
                  <div className="th-sub">≥ {fmtNum(std.dlt911.bands[b].threshold, std, 1)}</div>
                </th>
              ))}
              <th>Mức độ (DL/T 911 Bảng A.1)</th>
              <th>Hành động gợi ý</th>
              <th>Cảnh báo</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ row, result, error }) => (
              <tr
                key={row.key}
                className={result ? `clickable lv-row-${result.classification.id}` : "dim"}
                onClick={() => result && onOpen(row.key)}
              >
                <td className="num">{row.index ?? "–"}</td>
                <td>
                  <strong>{row.label}</strong>
                </td>
                <td>{result?.group.label ?? ""}</td>
                {bands.map((b) => {
                  const br = result?.bands[b];
                  const below = br && br.rxy !== null && br.rxy < br.threshold;
                  return (
                    <td key={b} className={`num${below ? " below" : ""}`}>
                      {fmtNum(br?.rxy, std)}
                    </td>
                  );
                })}
                <td>{result ? <LevelBadge c={result.classification} /> : <span className="err">{error}</span>}</td>
                <td>{result?.action}</td>
                <td>
                  <Warnings items={result?.warnings.filter((w) => w.severity === "warning") ?? []} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Bấm vào một dòng để xem giản đồ Bode và bảng tính trung gian. Giá trị tô đỏ: dưới ngưỡng bình thường của dải.
      </p>
    </div>
  );
}
