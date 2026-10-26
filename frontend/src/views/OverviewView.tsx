import { useMemo, useRef } from "react";
import type { StorageStatus } from "../App";
import { LevelBadge } from "../components/common";
import type { Classification } from "../core/dlt911";
import type { TransformerGroup } from "../core/pairing";
import type { GridMode } from "../core/resample";
import type { Standards } from "../core/standards";
import { computeTrend } from "../core/trend";
import type { Trace } from "../core/types";
import { sessionLabel, type LoadError } from "../workspace";

interface Props {
  std: Standards;
  groups: TransformerGroup[];
  traces: Trace[];
  worst: Record<string, Classification | null>;
  traceCount: Record<string, number>;
  mode: GridMode;
  storage: StorageStatus;
  busy: boolean;
  errors: LoadError[];
  onImport: () => void;
  onOpen: (key: string) => void;
  onTrend: (key: string) => void;
  onBackup: () => void;
  onRestore: (packages: File[]) => void;
}

export default function OverviewView(p: Props) {
  const restoreInput = useRef<HTMLInputElement>(null);
  const trend = useMemo(() => {
    const out: Record<string, { warnings: number; insufficient: boolean }> = {};
    for (const g of p.groups) {
      if (g.sessions.length < 2) continue;
      const tr = computeTrend(p.traces.filter((t) => t.transformerKey === g.key), g.baselineSession, p.std, p.mode);
      out[g.key] = {
        warnings: tr.series.filter((s) => s.status.id === "warning").length,
        insufficient: tr.series.every((s) => s.status.id === "insufficient"),
      };
    }
    return out;
  }, [p.groups, p.traces, p.std, p.mode]);

  return (
    <div className="view">
      <header className="view-head split">
        <div>
          <h1>Tổng quan</h1>
          {p.groups.length > 0 && <p className="lede">Các máy biến áp đã nạp, kỳ đo gần nhất và đánh giá theo kỳ đang chọn.</p>}
        </div>
        {p.groups.length > 0 && (
          <button className="primary" onClick={p.onImport}>
            Nhập dữ liệu
          </button>
        )}
      </header>

      {p.groups.length === 0 ? (
        <section className="panel empty">
          <h2>Chưa có file đo nào</h2>
          <p>
            Nhập file đo SFRA của ít nhất hai kỳ cho cùng một máy biến áp: baseline (kỳ đo cơ sở) và lần đo cần đánh giá. Ứng dụng tự ghép cặp theo
            số thứ tự và ký hiệu phép đo, tính Rxy theo DL/T 911-2004 Phụ lục A và xếp mức theo Bảng A.1.
          </p>
          <p className="muted">File chỉ lưu trong trình duyệt của máy này, không gửi lên máy chủ.</p>
          <button className="primary" onClick={p.onImport}>
            Nhập dữ liệu
          </button>
        </section>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>MBA (số chế tạo)</th>
                <th>Vị trí</th>
                <th>Kỳ đo</th>
                <th>Kỳ gần nhất</th>
                <th className="num">Số đường đo</th>
                <th>Mức nặng nhất (kỳ đang chọn)</th>
                <th>Xu hướng</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {p.groups.map((g) => {
                const tr = trend[g.key];
                return (
                  <tr key={g.key}>
                    <td>
                      <strong>{g.key}</strong>
                    </td>
                    <td>{g.locations.join(", ")}</td>
                    <td>{g.sessions.map(sessionLabel).join(", ")}</td>
                    <td>{sessionLabel(g.sessions[g.sessions.length - 1])}</td>
                    <td className="num">{p.traceCount[g.key] ?? 0}</td>
                    <td>{p.worst[g.key] ? <LevelBadge c={p.worst[g.key]} /> : <span className="muted">Chưa có cặp để so</span>}</td>
                    <td>
                      {!tr ? (
                        <span className="muted">Một kỳ đo</span>
                      ) : tr.warnings ? (
                        <span className="badge trend-warning">{tr.warnings} phép đo cảnh báo</span>
                      ) : tr.insufficient ? (
                        <span className="muted">{p.std.trend.statuses.insufficient.label}</span>
                      ) : (
                        <span className="badge trend-stable">{p.std.trend.statuses.stable.label}</span>
                      )}
                    </td>
                    <td className="nowrap">
                      <button disabled={!p.worst[g.key]} onClick={() => p.onOpen(g.key)}>
                        Kết quả
                      </button>{" "}
                      <button disabled={!tr} onClick={() => p.onTrend(g.key)}>
                        Xu hướng
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="panel">
        <h2>Lưu trữ</h2>
        <p className={p.storage.ok ? "muted" : "note"}>
          {p.storage.message} {p.storage.ok && `${p.storage.fileCount} file gốc đang lưu.`}
        </p>
        <p className="muted small">
          Dữ liệu chỉ nằm trong trình duyệt của máy này và sẽ mất nếu xóa dữ liệu trình duyệt. Nên sao lưu định kỳ; file sao
          lưu (.zip) chứa file đo gốc và các chỉnh sửa, khôi phục được trên máy khác.
        </p>
        <div className="row gap wrap">
          <button onClick={p.onBackup} disabled={!p.storage.ok || !p.storage.fileCount || p.busy}>
            Sao lưu (.zip)
          </button>
          <button onClick={() => restoreInput.current?.click()} disabled={p.busy}>
            Khôi phục từ file sao lưu…
          </button>
          <input
            ref={restoreInput}
            type="file"
            accept=".zip"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) p.onRestore(files);
              e.target.value = "";
            }}
          />
          {p.busy && <span className="muted">Đang xử lý…</span>}
        </div>
        {p.errors.length > 0 && (
          <ul className="warns">
            {p.errors.map((e, i) => (
              <li key={i} className="warning">
                {e.file}: {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
