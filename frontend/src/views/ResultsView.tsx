import { useMemo, useState } from "react";
import type { TransformerGroup } from "../core/pairing";
import type { GridMode } from "../core/resample";
import { fmtNum, transformerConclusion } from "../core/rules";
import type { Standards } from "../core/standards";
import { InternalTag, LevelBadge, Warnings } from "../components/common";
import { sessionLabel, type RowResult } from "../workspace";
import { hint, interpret } from "../core/training/interpret";

interface Props {
  std: Standards;
  group: TransformerGroup;
  results: RowResult[];
  onOpen: (rowKey: string) => void;
  onCompare: () => void;
}

/** Bands that changed and the failure modes they fit best, in one line; details in the detail screen */
const ieeeHint = (r: Parameters<typeof interpret>[0], std: Standards): string => hint(interpret(r, std));

export const MODE_OPTIONS: { value: GridMode; label: string }[] = [
  { value: "auto", label: "Tự động (A hoặc B)" },
  { value: "A", label: "A: nguyên bản" },
  { value: "B", label: "B: theo lưới baseline" },
  { value: "C", label: "C: lưới log 200 điểm/decade" },
];

export default function ResultsView({ std, group, results, onOpen, onCompare }: Props) {
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
      <header className="view-head">
        <h1>Kết quả kỳ đo</h1>
        {group.sessions.length < 2 ? (
          <p className="lede">
            Kỳ đo {sessionLabel(group.testSession)} là kỳ duy nhất của máy này, chưa có baseline để tính Rxy theo DL/T 911-2004.
          </p>
        ) : (
        <p className="lede">
          Lần đo {sessionLabel(group.testSession)} so với baseline {sessionLabel(group.baselineSession)}, hệ số tương quan Rxy theo DL/T
          911-2004 Phụ lục A. Chọn một phép đo để xem giản đồ và bảng tính.
        </p>
        )}
      </header>

      {group.sessions.length < 2 && (
        <section className="statement">
          <p className="statement-text">
            Cần thêm file của một ngày đo khác, cùng số chế tạo {group.serialNumber || group.key}, làm baseline. Trong lúc chưa có
            baseline, có thể so sánh tham khảo giữa các pha hoặc với máy cùng kiểu.
          </p>
          <button className="primary" onClick={onCompare}>
            So sánh giữa các pha
          </button>
        </section>
      )}

      {conclusion && (
        <section className={`statement lv-border-${conclusion.worst.id}`}>
          <p className="statement-text">{conclusion.text}</p>
          <p className="muted small">
            Căn cứ: {std.dlt911.classification.source}. Bộ quy tắc {std.ruleset.id} phiên bản {std.versionTag}. Hành động gợi ý là{" "}
            <InternalTag />.
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
              <th title={std.interpretation?.source}>Đối chiếu IEEE C57.149 (tham khảo)</th>
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
                <td className="nowrap">{result?.group.label ?? ""}</td>
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
                <td className="small">{result ? ieeeHint(result, std) : ""}</td>
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
