/** Module 5, instructor side: build a training pack from measurement files, with the answer of each case. */
import { useMemo, useRef, useState } from "react";
import { analyzePair } from "../../core/analysis";
import type { CsvProfile } from "../../core/parsers";
import type { GridMode } from "../../core/resample";
import { sha256Hex, type Standards } from "../../core/standards";
import type { Trace } from "../../core/types";
import { faultInfo, TRAINING } from "../../core/training/content";
import { newCaseId, readPack, writePack, type PackFile, type TrainingCase } from "../../core/training/pack";
import { largestShift } from "../../core/training/score";
import { fmtHz } from "../../core/quality";
import { fileSafe, saveBlob } from "../../storage/saveFile";
import { parsePackFiles, traceLabel } from "./packFiles";
import { AppAnalysis, PairPlot } from "./shared";

const blank = (): TrainingCase => ({
  id: newCaseId(), title: "", transformer: "", history: "", task: "", refId: "", testId: "",
  answer: { fault: "", bands: [], recommendation: "" }, askMeasure: true, explanation: "",
});

/** what is still missing before a case can go into a pack */
const missing = (c: TrainingCase): string[] =>
  [
    !c.title.trim() && "tên bài",
    !c.refId && "đường chuẩn",
    !c.testId && "đường cần đánh giá",
    c.refId && c.refId === c.testId && "hai đường khác nhau",
    !c.answer.fault && "dạng hư hỏng đúng",
    !c.answer.recommendation && "khuyến nghị đúng",
  ].filter(Boolean) as string[];

export default function AuthorTab({ std, mode, profiles }: { std: Standards; mode: GridMode; profiles: CsvProfile[] }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [files, setFiles] = useState<PackFile[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [cases, setCases] = useState<TrainingCase[]>([blank()]);
  const [idx, setIdx] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const packInput = useRef<HTMLInputElement>(null);

  const c = cases[idx] ?? cases[0];
  const update = (patch: Partial<TrainingCase>) => setCases((cs) => cs.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const byId = useMemo(() => new Map(traces.map((t) => [t.id, t])), [traces]);
  const r = useMemo(() => {
    const ref = byId.get(c.refId);
    const test = byId.get(c.testId);
    return ref && test && ref.id !== test.id ? analyzePair(ref, test, std, { mode }) : null;
  }, [byId, c.refId, c.testId, std, mode]);
  const shift = r ? largestShift(r.peaks) : null;

  const addFiles = async (list: File[]) => {
    const fresh: PackFile[] = [];
    for (const f of list) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      if (!files.some((x) => x.sha256 === sha256) && !fresh.some((x) => x.sha256 === sha256)) fresh.push({ sha256, name: f.name, bytes });
    }
    const { traces: ts, errors: errs } = await parsePackFiles(fresh, std, profiles);
    const ok = new Set(ts.map((t) => t.sha256));
    setFiles((fs) => [...fs, ...fresh.filter((f) => ok.has(f.sha256))]);
    setTraces((all) => [...all, ...ts]);
    setErrors(errs);
  };

  const openPack = async (file: File) => {
    try {
      const p = await readPack(await file.arrayBuffer());
      const { traces: ts, errors: errs } = await parsePackFiles(p.files, std, profiles);
      setTitle(p.title);
      setAuthor(p.author);
      setFiles(p.files);
      setTraces(ts);
      setCases(p.cases.length ? p.cases : [blank()]);
      setIdx(0);
      setErrors(errs);
      setNotice(`Đã mở gói "${p.title}" để sửa.`);
    } catch (e) {
      setErrors([(e as Error).message]);
    }
  };

  const incomplete = cases.map((x, i) => [i, missing(x)] as const).filter(([, m]) => m.length);
  const save = async () => {
    const blob = await writePack({ title: title.trim() || "Gói bài tập SFRA", author: author.trim(), createdAt: new Date().toISOString(), cases, files });
    if (await saveBlob(blob, `${fileSafe(title || "goi_bai_tap_SFRA")}.zip`)) setNotice(`Đã lưu gói với ${cases.length} bài.`);
  };

  return (
    <div className="training-tab">
      <p className="note">
        Gói bài tập chứa file đo gốc và đáp án, lưu thành file .zip trên máy này để phát cho học viên. Không đưa gói chứa số liệu thiết bị lên kho mã
        nguồn hay nơi công khai.
      </p>
      <section className="theory-section">
        <div className="form-grid">
          <label className="field">
            <span>Tên gói bài tập</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Chẩn đoán biến dạng cuộn dây, đợt 1" />
          </label>
          <label className="field">
            <span>Người soạn</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
        </div>
        <div className="row gap wrap author-actions">
          <button onClick={() => fileInput.current?.click()}>Nạp file đo…</button>
          <button onClick={() => packInput.current?.click()}>Mở gói đã soạn…</button>
          <span className="muted">{traces.length} đường đo từ {files.length} file.</span>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".csv,.sfra,.frax,.xml,.txt,.dat"
            hidden
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length) void addFiles(list);
              e.target.value = "";
            }}
          />
          <input
            ref={packInput}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openPack(f);
              e.target.value = "";
            }}
          />
        </div>
        {errors.map((e) => (
          <p key={e} className="err">
            {e}
          </p>
        ))}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </section>

      <div className="chips case-chips" role="tablist" aria-label="Các bài trong gói">
        {cases.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === idx} className={i === idx ? "chip on" : "chip"} onClick={() => setIdx(i)}>
            {i + 1}. {x.title || "(chưa đặt tên)"}
            {missing(x).length ? " *" : ""}
          </button>
        ))}
        <button
          className="chip"
          onClick={() => {
            setCases((cs) => [...cs, blank()]);
            setIdx(cases.length);
          }}
        >
          Thêm bài
        </button>
      </div>

      <section className="theory-section case-editor">
        <div className="form-grid">
          <label className="field">
            <span>Tên bài</span>
            <input value={c.title} onChange={(e) => update({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Yêu cầu so sánh</span>
            <input value={c.task} onChange={(e) => update({ task: e.target.value })} placeholder="Ví dụ: Pha A cuộn cao áp, trước và sau sự cố ngắn mạch ngoài" />
          </label>
          <label className="field wide">
            <span>Thông số máy</span>
            <textarea rows={2} value={c.transformer} onChange={(e) => update({ transformer: e.target.value })} />
          </label>
          <label className="field wide">
            <span>Lịch sử vận hành, sự kiện</span>
            <textarea rows={2} value={c.history} onChange={(e) => update({ history: e.target.value })} />
          </label>
          <label className="field wide">
            <span>Đường chuẩn so sánh (baseline, pha khác hoặc máy cùng kiểu)</span>
            <select value={c.refId} onChange={(e) => update({ refId: e.target.value })}>
              <option value="">— chọn —</option>
              {traces.map((t) => (
                <option key={t.id} value={t.id}>
                  {traceLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="field wide">
            <span>Đường cần đánh giá</span>
            <select value={c.testId} onChange={(e) => update({ testId: e.target.value })}>
              <option value="">— chọn —</option>
              {traces.map((t) => (
                <option key={t.id} value={t.id}>
                  {traceLabel(t)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {r && (
          <>
            <h3>Xem trước (học viên thấy đồ thị này, chưa thấy phân tích)</h3>
            <PairPlot r={r} std={std} names={["Chuẩn so sánh", "Đường cần đánh giá"]} peaks />
            <AppAnalysis r={r} std={std} />
          </>
        )}

        <h3>Đáp án</h3>
        <div className="form-grid">
          <label className="field">
            <span>Dạng hư hỏng đúng</span>
            <select
              value={c.answer.fault}
              onChange={(e) => {
                const f = faultInfo(e.target.value);
                // suggest the bands the source names for this failure mode; the instructor can change them
                update({ answer: { ...c.answer, fault: e.target.value, bands: f ? [...f.bands] : c.answer.bands } });
              }}
            >
              <option value="">— chọn —</option>
              {TRAINING.faults.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Khuyến nghị đúng</span>
            <select value={c.answer.recommendation} onChange={(e) => update({ answer: { ...c.answer, recommendation: e.target.value } })}>
              <option value="">— chọn —</option>
              {TRAINING.recommendations.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="options-row">
          <legend>Dải tần thay đổi rõ nhất (gợi ý theo dạng hư hỏng, sửa theo đồ thị thực tế)</legend>
          {TRAINING.bands.map((b) => (
            <label key={b.id} className="check">
              <input
                type="checkbox"
                checked={c.answer.bands.includes(b.id)}
                onChange={(e) =>
                  update({ answer: { ...c.answer, bands: e.target.checked ? [...c.answer.bands, b.id] : c.answer.bands.filter((x) => x !== b.id) } })
                }
              />{" "}
              {b.label}
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={c.askMeasure} onChange={(e) => update({ askMeasure: e.target.checked })} /> Hỏi tần số cộng hưởng dịch nhiều
          nhất
        </label>
        <p className="muted small">
          {shift
            ? `App chấm theo cộng hưởng ${fmtHz(shift.ref!.freq)} → ${fmtHz(shift.test!.freq)}, sai số ±${TRAINING.scoring.measure_tolerance_pct} %.`
            : "Cặp đường này không có cộng hưởng nào bị dịch: câu đo sẽ được bỏ qua khi chấm."}
        </p>
        <label className="field wide">
          <span>Giải thích hiện cho học viên sau khi nộp</span>
          <textarea rows={3} value={c.explanation} onChange={(e) => update({ explanation: e.target.value })} />
        </label>
        <div className="row gap wrap">
          <button
            className="danger"
            disabled={cases.length < 2}
            onClick={() => {
              setCases((cs) => cs.filter((_, i) => i !== idx));
              setIdx(Math.max(0, idx - 1));
            }}
          >
            Xóa bài này
          </button>
        </div>
      </section>

      <section className="theory-section">
        {incomplete.length > 0 && (
          <p className="note">
            Còn thiếu:{" "}
            {incomplete.map(([i, m]) => `bài ${i + 1} (${m.join(", ")})`).join("; ")}.
          </p>
        )}
        <button className="primary" disabled={incomplete.length > 0} onClick={() => void save()}>
          Lưu gói bài tập (.zip)
        </button>
      </section>
    </div>
  );
}
