import { useMemo, useRef, useState } from "react";
import { checkTrace, fmtHz } from "../core/quality";
import { displayLabel, measurementIdOf, type MeasurementId, type TransformerGroup } from "../core/pairing";
import type { Standards } from "../core/standards";
import type { Trace } from "../core/types";
import CsvMapping, { type PendingMapping } from "../components/CsvMapping";
import { Warnings } from "../components/common";
import type { CsvProfile } from "../core/parsers";
import { signatureOf } from "../core/parsers/genericCsv";
import { dayKey, fmtDateTime, sessionLabel, setSessions, type LoadError } from "../workspace";

interface Props {
  std: Standards;
  traces: Trace[];
  groups: TransformerGroup[];
  errors: LoadError[];
  busy: boolean;
  onFiles: (files: File[]) => void;
  onGroups: (g: TransformerGroup[]) => void;
  onSetDate: (traceId: string, date: Date) => void;
  onRemove: (traceId: string) => void;
  onClear: () => void;
  onAnalyze: (groupKey: string) => void;
  onCompare: (groupKey: string) => void;
  pending: PendingMapping[];
  onMap: (profile: CsvProfile, item: PendingMapping) => void;
  onSkipPending: (item: PendingMapping) => void;
  /** Change the transformer (serial number) of files; empty key restores the value read from the file */
  onSetTransformer: (sha256s: string[], key: string, fromGroup?: string) => void;
  /** Change what a trace is paired by; null restores the values read from the file */
  onSetMeasurement: (traceId: string, m: MeasurementId | null) => void;
}

/** STT, label and open / short configuration of one trace, editable so it pairs with the right measurement. */
function MeasurementFields({ t, onSet }: { t: Trace; onSet: (m: MeasurementId | null) => void }) {
  const id = measurementIdOf(t);
  const short = id.shorted !== "";
  const set = (patch: Partial<MeasurementId>) => onSet({ ...id, ...patch });
  return (
    <div className="meas-edit">
      <input
        key={`i${id.index}`}
        className="stt-input"
        type="number"
        min={1}
        step={1}
        placeholder="STT"
        aria-label="STT"
        defaultValue={id.index ?? ""}
        onBlur={(e) => {
          const v = e.target.value.trim();
          const n = v ? Number(v) : null;
          if (n !== id.index && (n === null || (Number.isInteger(n) && n > 0))) set({ index: n });
        }}
      />
      <input
        key={`l${id.label}`}
        className="label-input"
        aria-label="Ký hiệu phép đo"
        defaultValue={id.label}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== id.label) set({ label: v });
        }}
      />
      <select
        aria-label="Cấu hình"
        value={short ? "short" : "open"}
        onChange={(e) => set({ shorted: e.target.value === "short" ? t.measurementOriginal?.shorted || "short" : "" })}
      >
        <option value="open">Hở mạch</option>
        <option value="short">Nối tắt</option>
      </select>
      {short && (
        <input
          key={`s${id.shorted}`}
          className="label-input"
          placeholder="Đầu nối tắt"
          aria-label="Đầu nối tắt"
          defaultValue={id.shorted === "short" ? "" : id.shorted}
          onBlur={(e) => {
            const v = e.target.value.trim() || "short";
            if (v !== id.shorted) set({ shorted: v });
          }}
        />
      )}
      {t.measurementOriginal && (
        <button type="button" className="link" onClick={() => onSet(null)}>
          Khôi phục
        </button>
      )}
    </div>
  );
}

/** Serial number of a whole group; entering another loaded transformer's number merges the two. */
function SerialEdit({ g, files, others, onApply }: { g: TransformerGroup; files: Trace[]; others: string[]; onApply: (key: string) => void }) {
  const [value, setValue] = useState(g.key);
  const edited = [...new Set(files.map((t) => t.transformerKeyOriginal).filter(Boolean))];
  const next = value.trim();
  const merge = others.includes(next);
  return (
    <form
      className="serial-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (next && next !== g.key) onApply(next);
      }}
    >
      <label className="field">
        <span>Số chế tạo</span>
        <input className="tx-input" list="tx-keys" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button type="submit" disabled={!next || next === g.key}>
        {merge ? "Gộp vào máy này" : "Đổi số chế tạo"}
      </button>
      {edited.length > 0 && (
        <span className="muted small">
          Đã sửa, trong file ghi {edited.join(", ")}.{" "}
          <button type="button" className="link" onClick={() => onApply("")}>
            Khôi phục
          </button>
        </span>
      )}
      {merge && <span className="muted small">Các file sẽ thành kỳ đo của máy {next} và được ghép cặp với các file của máy đó.</span>}
    </form>
  );
}

const ACCEPT = ".csv,.sfra,.frax,.xml,.txt,.dat";

export default function ImportView(p: Props) {
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(p.traces.map((t) => [t.id, t])), [p.traces]);

  const take = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter((f) => /\.(csv|sfra|frax|xml|txt|dat)$/i.test(f.name));
    if (files.length) p.onFiles(files);
  };

  const updateGroup = (g: TransformerGroup) => p.onGroups(p.groups.map((x) => (x.key === g.key ? g : x)));

  return (
    <div className="view">
      <h1>Nhập dữ liệu</h1>
      <p className="muted">
        File được đọc và tính toán ngay trong trình duyệt, không tải lên máy chủ. Hỗ trợ: FRA Data v2.0 (.csv), Doble
        SFRA (.sfra), Megger FRAX (.frax).
      </p>

      <div
        className={`dropzone${drag ? " drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          take(e.dataTransfer.files);
        }}
      >
        <div>
          <strong>Kéo thả file đo vào đây</strong>
          <div className="muted">hoặc</div>
          <div className="row gap">
            <button className="primary" onClick={() => fileInput.current?.click()} disabled={p.busy}>
              Chọn file…
            </button>
            <button onClick={() => dirInput.current?.click()} disabled={p.busy}>
              Chọn thư mục…
            </button>
          </div>
        </div>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={(e) => take(e.target.files)} />
        <input
          ref={dirInput}
          type="file"
          hidden
          // @ts-expect-error non-standard but supported by Chromium, Edge, Firefox
          webkitdirectory=""
          onChange={(e) => take(e.target.files)}
        />
      </div>
      {p.busy && <p className="muted">Đang đọc file…</p>}

      {p.pending.length > 0 && (
        <div className="view">
          <h2>Cần ánh xạ cột ({p.pending.length} file)</h2>
          <p className="muted">
            Không nhận dạng chắc chắn các cột của file CSV dưới đây (đặc tả mục 4.2). Chọn cột và đơn vị, đặt tên hồ sơ hãng; hồ
            sơ được lưu và tự áp dụng cho các file cùng dòng tiêu đề lần sau.
          </p>
          <CsvMapping
            key={p.pending[0].filename}
            item={p.pending[0]}
            sameHeaderCount={p.pending.filter((x) => signatureOf(x.sniff.headers) === signatureOf(p.pending[0].sniff.headers)).length}
            onSubmit={(profile) => p.onMap(profile, p.pending[0])}
            onCancel={() => p.onSkipPending(p.pending[0])}
          />
        </div>
      )}

      {p.errors.length > 0 && (
        <div className="panel error">
          <h3>Không đọc được {p.errors.length} file</h3>
          <ul>
            {p.errors.map((e, i) => (
              <li key={i}>
                <code>{e.file}</code>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.groups.map((g) => {
        const list = p.traces.filter((t) => t.transformerKey === g.key);
        const paired = g.rows.filter((r) => r.baselineId && r.testId && r.baselineId !== r.testId).length;
        const unpaired = g.rows.filter((r) => !(r.baselineId && r.testId));
        return (
          <section key={g.key} className="panel">
            <div className="row between wrap">
              <div>
                <h2>Máy biến áp {g.key}</h2>
                <p className="muted">
                  {g.locations.join(", ") || "Chưa ghi vị trí"}. {list.length} đường đo trong {g.sessions.length} kỳ đo.
                </p>
                <SerialEdit
                  key={g.key}
                  g={g}
                  files={list}
                  others={p.groups.map((x) => x.key).filter((k) => k !== g.key)}
                  onApply={(k) => p.onSetTransformer([...new Set(list.map((t) => t.sha256))], k, g.key)}
                />
              </div>
              <div className="row gap wrap">
                <label>
                  Baseline{" "}
                  <select
                    value={g.baselineSession}
                    onChange={(e) => updateGroup(setSessions(g, p.traces, e.target.value, g.testSession))}
                  >
                    {g.sessions.map((s) => (
                      <option key={s} value={s}>
                        {sessionLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Lần đo{" "}
                  <select
                    value={g.testSession}
                    onChange={(e) => updateGroup(setSessions(g, p.traces, g.baselineSession, e.target.value))}
                  >
                    {g.sessions.map((s) => (
                      <option key={s} value={s}>
                        {sessionLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary" disabled={!paired} onClick={() => p.onAnalyze(g.key)}>
                  Xác nhận và tính ({paired} cặp)
                </button>
              </div>
            </div>
            {g.sessions.length < 2 && (
              <div className="note">
                <p>
                  Máy này mới có một kỳ đo ({sessionLabel(g.testSession)}), chưa có baseline để đánh giá theo DL/T 911. Baseline là
                  file của một ngày đo khác, cùng số chế tạo {g.serialNumber || g.key}.
                </p>
                <ul>
                  <li>Nạp thêm file của kỳ trước.</li>
                  {g.rows.some((r) => r.candidates.length > 1) && (
                    <li>
                      Có phép đo gồm nhiều file trong cùng ngày, app chỉ dùng file mới nhất. Nếu một file thuộc kỳ trước, sửa cột Ngày đo của
                      file đó trong mục Danh sách file đã nạp.
                    </li>
                  )}
                  {p.groups.length > 1 && (
                    <li>
                      Nếu file kỳ trước ghi số chế tạo khác, sửa số chế tạo ở trên (cả nhóm) hoặc cột MBA trong mục Danh sách file đã
                      nạp (từng file).
                    </li>
                  )}
                  <li>
                    Khi chưa có baseline, có thể{" "}
                    <button className="link" onClick={() => p.onCompare(g.key)}>
                      so sánh tham khảo giữa các pha
                    </button>
                    .
                  </li>
                </ul>
              </div>
            )}

            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Phép đo</th>
                    <th>File baseline</th>
                    <th>File lần đo</th>
                    <th>Số điểm</th>
                    <th>Dải tần</th>
                    <th>Cảnh báo chất lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const test = r.testId ? byId.get(r.testId) : undefined;
                    const base = r.baselineId ? byId.get(r.baselineId) : undefined;
                    const pick = (field: "baselineId" | "testId", id: string) => {
                      if (id && !r.candidates.includes(id)) {
                        // a file of another measurement: give it this row's STT, label and configuration
                        p.onSetMeasurement(id, measurementIdOf(byId.get(r.candidates[0])!));
                        return;
                      }
                      updateGroup({
                        ...g,
                        rows: g.rows.map((x) => (x.key === r.key ? { ...x, [field]: id || null } : x)),
                      });
                    };
                    const sel = (field: "baselineId" | "testId", cur?: Trace) => {
                      const session = field === "baselineId" ? g.baselineSession : g.testSession;
                      const others = list.filter((t) => dayKey(t.testDate) === session && !r.candidates.includes(t.id));
                      return (
                        <select value={cur?.id ?? ""} onChange={(e) => pick(field, e.target.value)}>
                          <option value="">— không có —</option>
                          {r.candidates.map((id) => {
                            const t = byId.get(id)!;
                            return (
                              <option key={id} value={id}>
                                {sessionLabel(dayKey(t.testDate))}: {t.sourceName}
                              </option>
                            );
                          })}
                          {others.length > 0 && (
                            <optgroup label="Gán file khác của kỳ này vào phép đo này">
                              {others.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.index !== null ? `${t.index} ` : ""}
                                  {displayLabel(t)}: {t.sourceName}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      );
                    };
                    const edited = r.candidates.some((id) => byId.get(id)?.measurementOriginal);
                    const q = [
                      ...(base ? checkTrace(base, p.std).map((w) => ({ ...w, message: `Baseline: ${w.message}` })) : []),
                      ...(test ? checkTrace(test, p.std).map((w) => ({ ...w, message: `Lần đo: ${w.message}` })) : []),
                    ].filter((w) => w.severity === "warning");
                    return (
                      <tr key={r.key} className={base && test ? "" : "dim"}>
                        <td className="num">{r.index ?? "–"}</td>
                        <td>
                          <strong>{r.label}</strong>
                          {edited && <div className="muted small">Đã sửa phép đo</div>}
                        </td>
                        <td>{sel("baselineId", base)}</td>
                        <td>{sel("testId", test)}</td>
                        <td className="num">
                          {base?.freq.length ?? "–"} / {test?.freq.length ?? "–"}
                        </td>
                        <td className="nowrap">
                          {test ? `${fmtHz(test.freq[0])} – ${fmtHz(test.freq[test.freq.length - 1])}` : "–"}
                        </td>
                        <td>
                          <Warnings items={q} compact />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {g.sessions.length > 1 && unpaired.length > 0 && (
              <p className="note">
                Thiếu cặp (không tính): {unpaired.map((r) => `${r.index ?? ""} ${r.label}`.trim()).join(", ")}
              </p>
            )}

            <details>
              <summary>Danh sách file đã nạp ({list.length})</summary>
              <div className="table-wrap">
                <table className="grid small">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Định dạng</th>
                      <th>Đường đo</th>
                      <th>Ngày đo</th>
                      <th>Nguồn ngày</th>
                      <th>MBA</th>
                      <th>Phép đo (STT, ký hiệu, cấu hình)</th>
                      <th>Đầu đo</th>
                      <th>Ghi chú</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <code>{t.sourceName}</code>
                        </td>
                        <td>{t.formatLabel}</td>
                        <td>{t.traceName}</td>
                        <td>
                          <input
                            type="date"
                            value={t.testDate ? dayKey(t.testDate) : ""}
                            title={fmtDateTime(t.testDate)}
                            onChange={(e) => {
                              const [y, m, d] = e.target.value.split("-").map(Number);
                              if (y) p.onSetDate(t.id, new Date(y, m - 1, d, t.testDate?.getHours() ?? 0, t.testDate?.getMinutes() ?? 0));
                            }}
                          />
                        </td>
                        <td className="muted">{t.dateSource || "Chưa có"}</td>
                        <td>
                          <input
                            key={t.transformerKey}
                            className="tx-input"
                            list="tx-keys"
                            defaultValue={t.transformerKey}
                            title="Số chế tạo dùng để nhóm file thành các kỳ đo của một máy. Để trống để khôi phục giá trị trong file."
                            onBlur={(e) => {
                              if (e.target.value.trim() !== t.transformerKey) p.onSetTransformer([t.sha256], e.target.value);
                            }}
                          />
                        </td>
                        <td>
                          <MeasurementFields t={t} onSet={(m) => p.onSetMeasurement(t.id, m)} />
                        </td>
                        <td className="nowrap">
                          {t.setting.redLead || "–"} → {t.setting.blackLead || "–"}
                        </td>
                        <td className="muted">{t.parseNotes.join(" ")}</td>
                        <td>
                          <button className="link" onClick={() => p.onRemove(t.id)}>
                            Bỏ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        );
      })}

      <datalist id="tx-keys">
        {p.groups.map((g) => (
          <option key={g.key} value={g.key} />
        ))}
      </datalist>

      {p.traces.length > 0 && (
        <p>
          <button className="link danger" onClick={p.onClear}>
            Xóa toàn bộ dữ liệu đã nạp
          </button>
        </p>
      )}
    </div>
  );
}
