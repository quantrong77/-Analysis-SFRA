import { useMemo, useState } from "react";
import { bodeFigure, diffFigure, peakMarkers, type Backdrop, type CurveNames, type PlotOptions } from "../charts/figures";
import Plot from "../components/Plot";
import PlotTools from "../components/PlotTools";
import { PeakTable, Tb812Table } from "../components/IndexTables";
import { bankTraces, compareTraces, phaseGroups, phasePairs, phasePattern, type RefComparison } from "../core/compare";
import { dayKey, measurementConfig, type TransformerGroup } from "../core/pairing";
import type { GridMode } from "../core/resample";
import { fmtNum } from "../core/rules";
import type { Standards } from "../core/standards";
import type { Trace } from "../core/types";
import { sessionLabel } from "../workspace";

interface Props {
  std: Standards;
  group: TransformerGroup;
  traces: Trace[];
  mode: GridMode;
}

const traceName = (t: Trace) => `${t.index !== null ? `${t.index} ` : ""}${t.label}, MBA ${t.transformerKey}, ${sessionLabel(dayKey(t.testDate))}`;
const phaseName = (t: Trace) => phasePattern(t.label)?.phase ?? t.label;

function ComparisonDetail({ c, std, names }: { c: RefComparison; std: Standards; names: CurveNames }) {
  const [backdrop, setBackdrop] = useState<Backdrop>("iec");
  const [scale, setScale] = useState<"log" | "linear">("log");
  const [showPeaks, setShowPeaks] = useState(true);
  const [fit, setFit] = useState(0);
  const figs = useMemo(() => {
    const opt: PlotOptions = { backdrop, scale };
    const markers = showPeaks ? peakMarkers(c.peaks, names) : [];
    return { bode: bodeFigure({ baseline: c.a, test: c.b }, std, [], names, markers, opt), diff: diffFigure(c, std, opt) };
  }, [c, std, names, backdrop, scale, showPeaks]);
  return (
    <section className="panel">
      <div className="row between wrap">
        <h2>
          {names[0]} ↔ {names[1]}
        </h2>
        <span className="badge tag-ref">{std.reference_comparison.label}</span>
      </div>
      <p className="note">
        {std.reference_comparison.note} Căn cứ: {std.reference_comparison.source}.
      </p>
      <div className="files muted small">
        <div>
          Đường 1 (xanh liền): {traceName(c.a)}. File <span className="file-name">{c.a.sourceName}</span>
        </div>
        <div>
          Đường 2 (đỏ đứt): {traceName(c.b)}. File <span className="file-name">{c.b.sourceName}</span>
        </div>
        <div>Chế độ căn lưới: {c.aligned.modeLabel}</div>
      </div>
      <PlotTools
        std={std}
        backdrop={backdrop}
        onBackdrop={setBackdrop}
        scale={scale}
        onScale={setScale}
        showPeaks={showPeaks}
        onShowPeaks={setShowPeaks}
        onFit={() => setFit((n) => n + 1)}
      />
      <Plot key={`bode${fit}`} data={figs.bode.data} layout={figs.bode.layout} height={620} />
      <h3>Hiệu số ΔdB (đường 2 − đường 1)</h3>
      <Plot key={`diff${fit}`} data={figs.diff.data} layout={figs.diff.layout} height={240} />
      <h3>Rxy và chỉ số TB 812 theo dải DL/T 911 (không phân loại)</h3>
      <Tb812Table ranges={c.bands} std={std} showRxy />
      <h3>Theo vùng IEC 60076-18</h3>
      <Tb812Table ranges={c.zones} std={std} showRxy />
      <h3>Đỉnh cộng hưởng</h3>
      <PeakTable pa={c.peaks} std={std} refLabel="Đường 1" testLabel="Đường 2" />
    </section>
  );
}

export default function CompareView({ std, group, traces, mode }: Props) {
  const bank = useMemo(() => bankTraces(traces, group.key), [traces, group.key]);
  const mine = bank.traces;
  const [session, setSession] = useState(group.testSession);
  const groups = useMemo(() => phaseGroups(mine, std).filter((g) => g.session === session), [mine, std, session]);
  const [sel, setSel] = useState<{ a: string; b: string } | null>(null);
  const [freeA, setFreeA] = useState("");
  const [freeB, setFreeB] = useState("");
  const byId = useMemo(() => new Map(traces.map((t) => [t.id, t])), [traces]);
  const sorted = useMemo(() => [...traces].sort((x, y) => traceName(x).localeCompare(traceName(y))), [traces]);

  const rows = useMemo(
    () =>
      groups.flatMap((g) =>
        phasePairs(g).map(([a, b]) => {
          try {
            return { g, a, b, c: compareTraces(a, b, std, mode), err: null as string | null };
          } catch (e) {
            return { g, a, b, c: null, err: (e as Error).message };
          }
        }),
      ),
    [groups, std, mode],
  );

  const current = useMemo(() => {
    const pick = sel ?? (freeA && freeB ? { a: freeA, b: freeB } : null);
    const a = pick ? byId.get(pick.a) : undefined;
    const b = pick ? byId.get(pick.b) : undefined;
    if (!a || !b) return null;
    try {
      return { c: compareTraces(a, b, std, mode), err: null };
    } catch (e) {
      return { c: null, err: (e as Error).message };
    }
  }, [sel, freeA, freeB, byId, std, mode]);
  const names: CurveNames | null = current?.c
    ? sel
      ? [`Pha ${phaseName(current.c.a)} (${current.c.a.label})`, `Pha ${phaseName(current.c.b)} (${current.c.b.label})`]
      : [traceName(current.c.a), traceName(current.c.b)]
    : null;

  return (
    <div className="view">
      <header className="view-head">
        <h1>So sánh tham khảo</h1>
        <p className="lede">
          Khi chưa có baseline, so sánh giữa các pha trong cùng kỳ đo hoặc với máy biến áp cùng kiểu. Chỉ hiển thị chỉ số, không xếp mức
          theo DL/T 911 Bảng A.1.
        </p>
      </header>

      <section className="panel">
        <div className="row between wrap">
          <h2>Giữa các pha</h2>
          <label>
            Kỳ đo{" "}
            <select value={session} onChange={(e) => { setSession(e.target.value); setSel(null); }}>
              {group.sessions.map((s) => (
                <option key={s} value={s}>
                  {sessionLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {bank.units.length > 1 && (
          <p className="note">
            Máy một pha, so sánh cùng các máy một pha khác tại cùng vị trí và cùng ngày đo: {bank.units.join(", ")}.
          </p>
        )}
        {rows.length === 0 ? (
          <p className="muted">
            Không tìm thấy phép đo cùng loại trên các pha khác nhau trong kỳ này (ký hiệu dạng A-a / B-b / C-c, A-N, Y1-Y2, Y1_A-Y2_A).
            Với tổ máy một pha, nạp file của các máy pha còn lại (cùng vị trí, cùng ngày đo); hoặc chọn hai đường bất kỳ ở phần bên dưới.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="grid results">
              <thead>
                <tr>
                  <th>Nhóm phép đo</th>
                  <th>Cấu hình</th>
                  <th>Cặp pha</th>
                  {Object.keys(std.dlt911.bands).map((b) => (
                    <th key={b} className="num">
                      R{b}
                    </th>
                  ))}
                  <th className="num">LCC (LF)</th>
                  <th className="num">ASLE (LF)</th>
                  <th className="num">Đỉnh ghép / dịch lớn nhất</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ g, a, b, c, err }) => {
                  const on = sel?.a === a.id && sel?.b === b.id;
                  const maxShift = c?.peaks.matches.reduce((m, x) => (x.shiftPercent !== null && Math.abs(x.shiftPercent) > Math.abs(m) ? x.shiftPercent : m), 0);
                  return (
                    <tr key={`${a.id}-${b.id}`} className={`clickable${on ? " selected" : ""}`} onClick={() => setSel({ a: a.id, b: b.id })}>
                      <td>
                        <strong>{g.pattern}</strong> ({g.members.map((m) => m.trace.index ?? m.trace.label).join(", ")})
                      </td>
                      <td className="small">
                        {measurementConfig(a) === "open" ? "Hở mạch" : `Nối tắt${g.shorted && g.shorted !== "none" ? ` ${g.shorted}` : ""}`}
                      </td>
                      <td>
                        {a.label} ↔ {b.label}
                        {a.transformerKey !== b.transformerKey && (
                          <div className="muted small">
                            {a.transformerKey} ↔ {b.transformerKey}
                          </div>
                        )}
                      </td>
                      {c
                        ? c.bands.map((x) => (
                            <td key={x.key} className="num">
                              {fmtNum(x.rxy, std)}
                            </td>
                          ))
                        : <td colSpan={3} className="err small">{err}</td>}
                      <td className="num">{fmtNum(c?.bands[0].tb812.LCC, std, 4)}</td>
                      <td className="num">{fmtNum(c?.bands[0].tb812.ASLE, std, 3)}</td>
                      <td className="num">
                        {c ? `${c.peaks.matches.filter((m) => m.ref && m.test).length} / ${fmtNum(maxShift, std, 2)} %` : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Hai đường bất kỳ (MBA cùng kiểu, kỳ khác, pha khác)</h2>
        <div className="form-grid">
          <label className="field wide">
            <span>Đường 1 (tham chiếu)</span>
            <select value={freeA} onChange={(e) => { setFreeA(e.target.value); setSel(null); }}>
              <option value="">— chọn —</option>
              {sorted.map((t) => (
                <option key={t.id} value={t.id}>
                  {traceName(t)} ({t.sourceName})
                </option>
              ))}
            </select>
          </label>
          <label className="field wide">
            <span>Đường 2</span>
            <select value={freeB} onChange={(e) => { setFreeB(e.target.value); setSel(null); }}>
              <option value="">— chọn —</option>
              {sorted.map((t) => (
                <option key={t.id} value={t.id}>
                  {traceName(t)} ({t.sourceName})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {current?.err && <p className="err">{current.err}</p>}
      {current?.c && names && <ComparisonDetail c={current.c} std={std} names={names} />}
    </div>
  );
}
