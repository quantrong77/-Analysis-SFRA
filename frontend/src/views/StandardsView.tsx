import { useState } from "react";
import { InternalTag, LevelBadge } from "../components/common";
import type { CsvProfile } from "../core/parsers";
import { fmtHz } from "../core/quality";
import { fmtNum } from "../core/rules";
import type { Standards } from "../core/standards";

const OP: Record<string, string> = { lt: "<", le: "≤", gt: ">", ge: "≥" };

function clauseText(clause: Record<string, Record<string, number>>): string {
  return Object.entries(clause)
    .map(([k, conds]) => Object.entries(conds).map(([op, v]) => `${k} ${OP[op]} ${String(v).replace(".", ",")}`).join(" và "))
    .join(" và ");
}

interface Props {
  std: Standards;
  profiles: CsvProfile[];
  onDeleteProfile: (id: string) => void;
  /** returns the problems found; empty = saved */
  onSaveRules: (text: string) => Promise<string[]>;
  onResetRules: () => void;
}

const DELIM_NAME: Record<string, string> = { ";": "chấm phẩy", ",": "phẩy", "\t": "tab" };

export default function StandardsView({ std, profiles, onDeleteProfile, onSaveRules, onResetRules }: Props) {
  const c = std.dlt911.classification;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(std.rawText);
  const [problems, setProblems] = useState<string[] | null>(null);
  return (
    <div className="view">
      <h1>Cấu hình bộ quy tắc</h1>
      <p className="muted">
        {std.ruleset.description}. Phiên bản {std.versionTag} ({std.ruleset.date}). Mọi ngưỡng lấy từ file{" "}
        <code>standards.yaml</code>
        {std.isCustom ? "; đang dùng bộ quy tắc tùy chỉnh lưu trong trình duyệt." : "."}
      </p>
      {std.isCustom && (
        <p className="note">
          Đang dùng bộ quy tắc đã sửa. Mọi kết quả và báo cáo ghi phiên bản {std.versionTag}.{" "}
          <button className="link" onClick={onResetRules}>
            Quay về bộ quy tắc mặc định
          </button>
        </p>
      )}

      <section className="panel">
        <h2>Dải tần và ngưỡng Rxy</h2>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Dải</th>
                <th>Điều kiện</th>
                <th className="num">Ngưỡng bình thường</th>
                <th>Căn cứ</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(std.dlt911.bands).map(([k, b]) => (
                <tr key={k}>
                  <td>
                    <strong>R{k}</strong> {b.label}
                  </td>
                  <td className="nowrap">
                    {fmtHz(b.f_min)} {b.include_min ? "≤" : "<"} f {b.include_max ? "≤" : "<"} {fmtHz(b.f_max)}
                  </td>
                  <td className="num">≥ {fmtNum(b.threshold, std, 1)}</td>
                  <td className="muted">{b.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Phân loại mức độ biến dạng</h2>
        <p className="muted">{c.source}. Xét theo thứ tự từ nặng đến nhẹ, gặp điều kiện đầu tiên thì dừng.</p>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Thứ tự</th>
                <th>Mức độ</th>
                <th>Điều kiện</th>
                <th>Hành động gợi ý</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {c.levels.map((l, i) => (
                <tr key={l.id}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <LevelBadge c={{ ...l, source: l.source ?? c.source, note: l.note ?? "" }} />
                  </td>
                  <td>{(l.any ?? []).map(clauseText).join(" hoặc ")}</td>
                  <td>{std.actions.by_level[l.id]}</td>
                  <td className="muted small">{l.in_standard ? "" : `${l.source ?? ""}. ${l.note ?? ""}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          Hành động gợi ý: <InternalTag /> ({std.actions.source})
        </p>
      </section>

      <section className="panel">
        <h2>Ngưỡng nội bộ khác</h2>
        <ul>
          <li>
            Ký hiệu đầu cực tương đương ({Object.entries(std.quality.pair.terminal_aliases.map).map(([a, b]) => `${a}=${b}`).join(", ")}){" "}
            <InternalTag />
          </li>
          <li>
            Giá trị coi là như nhau: {std.quality.pair.value_equivalents.groups.map((g: string[]) => g.join(" = ")).join("; ")} <InternalTag />
          </li>
          <li>
            Dịch tần đỉnh cộng hưởng: {std.peaks.shift_thresholds_percent.warning} % / {std.peaks.shift_thresholds_percent.alarm} %; prominence{" "}
            {fmtNum(std.peaks.prominence_db, std, 1)} dB; cửa sổ ghép ±{fmtNum(std.peaks.match_window_ratio * 100, std, 0)} % <InternalTag />
          </li>
          <li>
            Xu hướng: cần ≥ {std.trend.min_sessions} kỳ; cảnh báo khi RMF/RHF giảm &gt; {fmtNum(std.trend.rmf_rhf_drop_ratio * 100, std, 0)} %{" "}
            <InternalTag />
          </li>
          <li>
            Megger FRAX: biên độ = {std.vendors.frax.magnitude_db}{" "}
            {std.vendors.frax.magnitude_confirmed ? <span className="muted">({std.vendors.frax.magnitude_check})</span> : <strong className="err">— chưa đối chiếu</strong>}
            ; góc pha = {std.vendors.frax.phase_deg}{" "}
            {std.vendors.frax.phase_confirmed ? <span className="muted">(đã đối chiếu)</span> : <strong className="err">— {std.vendors.frax.phase_check}</strong>}
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>Chỉ số CIGRE TB 812 (chỉ hiển thị, không có ngưỡng)</h2>
        <p className="muted small">
          {std.tb812.source}. {std.tb812.note}
        </p>
        <div className="table-wrap">
          <table className="grid small">
            <thead>
              <tr>
                <th>Chỉ số</th>
                <th>Tên</th>
                <th>Phương trình</th>
                <th>Giá trị lý tưởng</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {(std.tb812.indices as { id: string; name: string; equation: string; ideal: number; note?: string }[]).map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.id}</strong>
                  </td>
                  <td>{i.name}</td>
                  <td>{i.equation || "–"}</td>
                  <td>{i.ideal}</td>
                  <td className="muted">{i.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Hồ sơ hãng CSV ({profiles.length})</h2>
        {profiles.length === 0 ? (
          <p className="muted">Chưa có. Hồ sơ được tạo khi ánh xạ cột một file CSV không tự nhận dạng được (Nhập dữ liệu).</p>
        ) : (
          <div className="table-wrap">
            <table className="grid small">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Tiêu đề cột</th>
                  <th>Phân cách / thập phân</th>
                  <th>Cột f / biên độ / pha</th>
                  <th>Đơn vị</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>
                      <code>{p.signature || "(không có tiêu đề)"}</code>
                    </td>
                    <td>
                      {DELIM_NAME[p.delimiter] ?? p.delimiter} / {p.decimalComma ? "dấu phẩy" : "dấu chấm"}
                    </td>
                    <td>
                      {p.freqCol + 1} / {p.magCol + 1} / {p.phaseCol === null ? "–" : p.phaseCol + 1}
                    </td>
                    <td>
                      {p.freqUnit}, {p.magUnit === "dB" ? "dB" : "tuyến tính"}, {p.phaseUnit === "deg" ? "độ" : "radian"}
                    </td>
                    <td>
                      <button className="link danger" onClick={() => onDeleteProfile(p.id)}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="row between wrap">
          <h2>Sửa bộ quy tắc (standards.yaml)</h2>
          {!editing && (
            <button
              onClick={() => {
                setDraft(std.rawText);
                setProblems(null);
                setEditing(true);
              }}
            >
              Sửa…
            </button>
          )}
        </div>
        <p className="muted small">
          Thay đổi được kiểm tra trước khi áp dụng và lưu trong trình duyệt này. Ghi rõ trường <code>source</code> cho ngưỡng mới; ngưỡng không
          có trong tiêu chuẩn phải đánh dấu <code>internal: true</code>.
        </p>
        {editing ? (
          <>
            <textarea className="yaml-edit" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />
            {problems && problems.length > 0 && (
              <ul className="warns">
                {problems.map((x, i) => (
                  <li key={i} className="warning">
                    {x}
                  </li>
                ))}
              </ul>
            )}
            <div className="row gap">
              <button
                className="primary"
                onClick={async () => {
                  const pr = await onSaveRules(draft);
                  setProblems(pr);
                  if (!pr.length) setEditing(false);
                }}
              >
                Kiểm tra và áp dụng
              </button>
              <button onClick={() => setEditing(false)}>Hủy</button>
            </div>
          </>
        ) : (
          <details>
            <summary>Xem toàn văn</summary>
            <pre className="yaml">{std.rawText}</pre>
          </details>
        )}
      </section>
    </div>
  );
}
