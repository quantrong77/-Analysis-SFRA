/** Module 5, trainee side: open a training pack, work through its cases, get scored, export the result sheet. */
import { useMemo, useRef, useState } from "react";
import { analyzePair, type PairResult } from "../../core/analysis";
import type { CsvProfile } from "../../core/parsers";
import type { GridMode } from "../../core/resample";
import type { Standards } from "../../core/standards";
import type { Trace } from "../../core/types";
import { faultInfo, TRAINING } from "../../core/training/content";
import { readPack, type TrainingCase, type TrainingPack } from "../../core/training/pack";
import { largestShift, scoreCase, type CaseScore, type Response } from "../../core/training/score";
import { fmtHz } from "../../core/quality";
import { fileSafe, saveBlob } from "../../storage/saveFile";
import { parsePackFiles } from "./packFiles";
import { AppAnalysis, PairPlot, Source } from "./shared";

const EMPTY: Response = { fault: "", bands: [], recommendation: "", measureHz: null };

export default function ExerciseTab({ std, mode, profiles }: { std: Standards; mode: GridMode; profiles: CsvProfile[] }) {
  const [pack, setPack] = useState<TrainingPack | null>(null);
  const [traces, setTraces] = useState<Map<string, Trace>>(new Map());
  const [errors, setErrors] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [scores, setScores] = useState<Record<string, CaseScore>>({});
  const [learner, setLearner] = useState("");
  const [summary, setSummary] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const open = async (file: File) => {
    try {
      const p = await readPack(await file.arrayBuffer());
      const { traces: ts, errors: errs } = await parsePackFiles(p.files, std, profiles);
      setPack(p);
      setTraces(new Map(ts.map((t) => [t.id, t])));
      setErrors(errs);
      setIdx(0);
      setResponses({});
      setScores({});
      setSummary(false);
    } catch (e) {
      setErrors([(e as Error).message]);
    }
  };

  const c: TrainingCase | undefined = pack?.cases[idx];
  const r: PairResult | null = useMemo(() => {
    const ref = c && traces.get(c.refId);
    const test = c && traces.get(c.testId);
    return ref && test ? analyzePair(ref, test, std, { mode }) : null;
  }, [c, traces, std, mode]);

  const opener = (
    <div className="row gap wrap">
      <button className={pack ? "" : "primary"} onClick={() => input.current?.click()}>
        {pack ? "Mở gói khác…" : "Mở gói bài tập (.zip)…"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void open(f);
          e.target.value = "";
        }}
      />
    </div>
  );

  if (!pack) {
    return (
      <div className="training-tab">
        <section className="panel empty">
          <h2>Bài tập chẩn đoán</h2>
          <p>
            Mở gói bài tập do giảng viên soạn ở tab Soạn bài. Mỗi bài cho một cặp đường đo: xác định dạng hư hỏng, dải tần thay đổi rõ, đọc tần số cộng hưởng
            dịch nhiều nhất và chọn khuyến nghị; app chấm điểm và giải thích sau khi nộp.
          </p>
          <p className="muted">Gói bài tập chứa file đo thật, chỉ mở trên máy này; app không gửi đi đâu.</p>
          {opener}
          {errors.map((e) => (
            <p key={e} className="err">
              {e}
            </p>
          ))}
        </section>
      </div>
    );
  }

  const done = pack.cases.filter((x) => scores[x.id]);
  const total = done.reduce((s, x) => s + scores[x.id].points, 0);
  const totalMax = done.reduce((s, x) => s + scores[x.id].max, 0);

  const exportSheet = async () => {
    const [{ Packer }, { buildResultSheet }] = await Promise.all([import("docx"), import("../../report/trainingResult")]);
    const doc = buildResultSheet({ pack, learner, responses, scores, date: new Date() });
    await saveBlob(await Packer.toBlob(doc), `Ket_qua_SFRA_${fileSafe(learner || "hoc_vien")}_${fileSafe(pack.title)}.docx`);
  };

  return (
    <div className="training-tab">
      <div className="row between wrap">
        <div>
          <h2>{pack.title}</h2>
          <p className="muted">
            {pack.cases.length} bài{pack.author ? `, người soạn ${pack.author}` : ""}. Đã làm {done.length}/{pack.cases.length}
            {totalMax ? `, ${total}/${totalMax} điểm` : ""}.
          </p>
        </div>
        {opener}
      </div>
      {errors.map((e) => (
        <p key={e} className="err">
          {e}
        </p>
      ))}
      <div className="chips case-chips" role="tablist" aria-label="Các bài">
        {pack.cases.map((x, i) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={!summary && i === idx}
            className={!summary && i === idx ? "chip on" : "chip"}
            onClick={() => {
              setIdx(i);
              setSummary(false);
            }}
          >
            {i + 1}. {x.title}
            {scores[x.id] ? ` (${scores[x.id].percent} %)` : ""}
          </button>
        ))}
        <button className={summary ? "chip on" : "chip"} onClick={() => setSummary(true)}>
          Tổng kết
        </button>
      </div>

      {summary ? (
        <section className="theory-section">
          <h2>Tổng kết</h2>
          <label className="field">
            <span>Họ tên học viên</span>
            <input value={learner} onChange={(e) => setLearner(e.target.value)} />
          </label>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Bài</th>
                  <th className="num">Điểm</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {pack.cases.map((x) => (
                  <tr key={x.id}>
                    <td>{x.title}</td>
                    <td className="num">{scores[x.id] ? `${scores[x.id].points}/${scores[x.id].max}` : "chưa làm"}</td>
                    <td className="num">{scores[x.id]?.percent ?? "–"}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Tổng</td>
                  <td className="num">
                    {total}/{totalMax}
                  </td>
                  <td className="num">{totalMax ? Math.round((total / totalMax) * 1000) / 10 : "–"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">{TRAINING.scoring.source}.</p>
          <button className="primary" disabled={!done.length} onClick={() => void exportSheet()}>
            Xuất phiếu kết quả (.docx)
          </button>
        </section>
      ) : c ? (
        <CaseView
          key={c.id}
          c={c}
          r={r}
          std={std}
          pack={pack}
          response={responses[c.id] ?? EMPTY}
          score={scores[c.id]}
          onResponse={(res) => setResponses((m) => ({ ...m, [c.id]: res }))}
          onSubmit={() => {
            const res = responses[c.id] ?? EMPTY;
            setScores((m) => ({ ...m, [c.id]: scoreCase(c, res, r?.peaks ?? null, pack) }));
          }}
          onNext={() => (idx < pack.cases.length - 1 ? setIdx(idx + 1) : setSummary(true))}
          last={idx === pack.cases.length - 1}
        />
      ) : null}
    </div>
  );
}

function CaseView({ c, r, std, pack, response, score, onResponse, onSubmit, onNext, last }: {
  c: TrainingCase;
  r: PairResult | null;
  std: Standards;
  pack: TrainingPack;
  response: Response;
  score?: CaseScore;
  onResponse: (r: Response) => void;
  onSubmit: () => void;
  onNext: () => void;
  last: boolean;
}) {
  const asksMeasure = Boolean(c.askMeasure && r && largestShift(r.peaks));
  const ready = response.fault && response.recommendation && (!asksMeasure || response.measureHz !== null);
  const set = (patch: Partial<Response>) => onResponse({ ...response, ...patch });
  // the typed text is kept as typed (a trailing decimal mark included); the number goes to the response
  const [measure, setMeasure] = useState(response.measureHz === null ? "" : String(response.measureHz / 1e3));
  const answer = faultInfo(c.answer.fault);
  const mark = (ok: boolean) => <span className={ok ? "mark ok" : "mark bad"}>{ok ? "Đúng" : "Sai"}</span>;
  return (
    <div className="case-view">
      <section className="case-info">
        <h2>{c.title}</h2>
        {c.task && <p className="case-task">{c.task}</p>}
        <dl className="case-facts">
          {c.transformer && (
            <>
              <dt>Thông số máy</dt>
              <dd>{c.transformer}</dd>
            </>
          )}
          {c.history && (
            <>
              <dt>Lịch sử vận hành</dt>
              <dd>{c.history}</dd>
            </>
          )}
        </dl>
      </section>

      {r ? (
        <PairPlot r={r} std={std} names={["Chuẩn so sánh", "Đường cần đánh giá"]} />
      ) : (
        <p className="err">Không đọc được file đo của bài này trong gói.</p>
      )}

      <form
        className="answer-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !score) onSubmit();
        }}
      >
        <fieldset disabled={Boolean(score)}>
          <legend>1. Dạng hư hỏng</legend>
          <div className="options">
            {TRAINING.faults.map((f) => (
              <label key={f.id} className="check">
                <input type="radio" name="fault" checked={response.fault === f.id} onChange={() => set({ fault: f.id })} /> {f.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={Boolean(score)}>
          <legend>2. Dải tần thay đổi rõ nhất</legend>
          <div className="options">
            {TRAINING.bands.map((b) => (
              <label key={b.id} className="check">
                <input
                  type="checkbox"
                  checked={response.bands.includes(b.id)}
                  onChange={(e) => set({ bands: e.target.checked ? [...response.bands, b.id] : response.bands.filter((x) => x !== b.id) })}
                />{" "}
                {b.label}
              </label>
            ))}
          </div>
          <Source>{TRAINING.bands_source}</Source>
        </fieldset>
        {asksMeasure && (
          <fieldset disabled={Boolean(score)}>
            <legend>3. Đo trên đồ thị</legend>
            <label className="field">
              <span>Tần số của đỉnh hoặc hố cộng hưởng bị dịch nhiều nhất (kHz), đọc trên đường nào cũng được</span>
              <input
                inputMode="decimal"
                value={measure}
                onChange={(e) => {
                  setMeasure(e.target.value);
                  const v = Number(e.target.value.replace(",", "."));
                  set({ measureHz: e.target.value.trim() && Number.isFinite(v) && v > 0 ? v * 1e3 : null });
                }}
              />
            </label>
            <p className="muted small">Gợi ý: bật Đỉnh/hố trong Cài đặt đồ thị, zoom vùng và rê chuột để đọc tần số. Sai số cho phép ±{TRAINING.scoring.measure_tolerance_pct} %.</p>
          </fieldset>
        )}
        <fieldset disabled={Boolean(score)}>
          <legend>{asksMeasure ? 4 : 3}. Khuyến nghị</legend>
          <div className="options">
            {TRAINING.recommendations.map((x) => (
              <label key={x.id} className="check">
                <input type="radio" name="rec" checked={response.recommendation === x.id} onChange={() => set({ recommendation: x.id })} /> {x.label}
              </label>
            ))}
          </div>
        </fieldset>
        {!score && (
          <button className="primary" type="submit" disabled={!ready}>
            Nộp bài này
          </button>
        )}
      </form>

      {score && (
        <section className="feedback" aria-live="polite">
          <h3>
            Kết quả: {score.points}/{score.max} điểm ({score.percent} %)
          </h3>
          <ul>
            <li>
              Dạng hư hỏng {mark(score.fault.correct)}: đáp án là {answer?.label ?? c.answer.fault}.
            </li>
            <li>
              Dải tần {mark(score.bands.correct)} ({score.bands.points}/{score.bands.max}): đáp án{" "}
              {c.answer.bands.map((b) => TRAINING.bands.find((x) => x.id === b)?.label ?? b).join(", ") || "không có dải nào"}.
            </li>
            {score.measure && r && (
              <li>
                Đo trên đồ thị {mark(score.measure.correct)}: {measureText(r)}
              </li>
            )}
            <li>
              Khuyến nghị {mark(score.recommendation.correct)}: đáp án là {TRAINING.recommendations.find((x) => x.id === c.answer.recommendation)?.label}.
            </li>
          </ul>
          {c.explanation && (
            <div className="note">
              <strong>Giải thích của giảng viên.</strong> {c.explanation}
            </div>
          )}
          {answer && answer.regions.length > 0 && (
            <>
              <h3>Biểu hiện của {answer.label.toLowerCase()} theo tài liệu</h3>
              <ul className="sourced">
                {answer.regions.map((x) => (
                  <li key={x.range}>
                    <strong>{x.range}:</strong> {x.text}
                  </li>
                ))}
              </ul>
              <Source>{answer.source}</Source>
            </>
          )}
          {r && (
            <>
              <h3>Phân tích của app</h3>
              <AppAnalysis r={r} std={std} />
            </>
          )}
          <button className="primary" onClick={onNext}>
            {last ? "Xem tổng kết" : "Bài tiếp theo"}
          </button>
          <span className="muted small"> {weightsText(pack)}</span>
        </section>
      )}
    </div>
  );
}

const WEIGHT_LABEL: Record<string, string> = { fault: "dạng hư hỏng", bands: "dải tần", measure: "đo trên đồ thị", recommendation: "khuyến nghị" };
const weightsText = (pack: TrainingPack) =>
  `Điểm tối đa: ${Object.entries({ ...TRAINING.scoring.weights, ...(pack.weights ?? {}) })
    .map(([k, v]) => `${WEIGHT_LABEL[k] ?? k} ${v}`)
    .join(", ")}.`;

const measureText = (r: PairResult) => {
  const s = largestShift(r.peaks);
  if (!s) return "";
  return `${s.kind === "peak" ? "đỉnh" : "hố"} ${fmtHz(s.ref!.freq)} trên đường chuẩn, ${fmtHz(s.test!.freq)} trên đường cần đánh giá.`;
};
