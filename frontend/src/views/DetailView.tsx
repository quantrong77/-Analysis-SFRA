import { useMemo, useState } from "react";
import { bodeFigure, diffFigure, peakMarkers, type Backdrop, type PlotOptions } from "../charts/figures";
import { PeakTable, Tb812Table } from "../components/IndexTables";
import Plot from "../components/Plot";
import PlotTools from "../components/PlotTools";
import { InternalTag, LevelBadge, Warnings } from "../components/common";
import type { PairResult } from "../core/analysis";
import { bandLevel, levelConditions } from "../core/dlt911";
import { dayKey, measurementConfig, type PairRow, type TransformerGroup } from "../core/pairing";
import { fmtHz, fmtHzShort } from "../core/quality";
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
  /** Use another file of this measurement as baseline or test */
  onPick: (rowKey: string, field: "baselineId" | "testId", id: string) => void;
}

// verdict colours come from the stylesheet tokens (--v-normal, ...), so the chart matches the tables
const levelColor = (id: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(`--v-${id}`).trim() || "#44515e";

type Tab = "compare" | "dlt911" | "peaks" | "tb812";

const TABS: { id: Tab; label: string }[] = [
  { id: "compare", label: "So sánh giản đồ Bode" },
  { id: "dlt911", label: "Hệ số DL/T 911" },
  { id: "peaks", label: "Đỉnh cộng hưởng" },
  { id: "tb812", label: "Chỉ số CIGRE TB 812" },
];

const shortName = (t: Trace) => `${sessionLabel(dayKey(t.testDate))} ${t.label}`;

export default function DetailView({ std, group, results, rowKey, traces, onSelect, onPick }: Props) {
  const [tab, setTab] = useState<Tab>("compare");
  const [extra, setExtra] = useState<string[]>([]);
  const [showPeaks, setShowPeaks] = useState(true);
  const [backdrop, setBackdrop] = useState<Backdrop>("dlt911");
  const [scale, setScale] = useState<"log" | "linear">("log");
  // remounting the plot is the reset to the full frequency range
  const [fit, setFit] = useState(0);
  const byId = useMemo(() => new Map(traces.map((t) => [t.id, t])), [traces]);
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
    const bandLabels: PlotOptions["bandLabels"] = {};
    for (const b of Object.values(r.bands)) {
      const lv = bandLevel(b.band, b.rxy, std);
      bandLabels[b.band] = { text: `<b>${b.band}</b><br>R${b.band} ${fmtNum(b.rxy, std, 2)}`, color: levelColor(lv?.id ?? "insufficient") };
    }
    const opt: PlotOptions = { backdrop, scale, bandLabels };
    return {
      bode: bodeFigure(r, std, extras, undefined, showPeaks ? peakMarkers(r.peaks) : [], opt),
      diff: diffFigure(r, std, opt),
    };
  }, [r, extra, traces, std, showPeaks, backdrop, scale]);

  if (!r || !plots) return <div className="view"><p>Chưa chọn phép đo.</p></div>;

  return (
    <div className="view">
      <header className="view-head split">
        <div>
          <h1>
            Phép đo {r.index !== null ? `${r.index}: ` : ""}
            {r.label}
          </h1>
          <p className="lede">
            {r.group.label}. Căn lưới {r.aligned.modeLabel}, {r.aligned.freq.length} điểm từ {fmtHz(r.aligned.fLo)} đến {fmtHz(r.aligned.fHi)}.
          </p>
        </div>
        <div className="stepper">
          <button disabled={idx <= 0} onClick={() => onSelect(ok[idx - 1].row.key)}>
            Phép đo trước
          </button>
          <select aria-label="Chọn phép đo" value={rowKey} onChange={(e) => onSelect(e.target.value)}>
            {ok.map((o) => (
              <option key={o.row.key} value={o.row.key}>
                {o.row.index ?? ""} {o.row.label}
              </option>
            ))}
          </select>
          <button disabled={idx >= ok.length - 1} onClick={() => onSelect(ok[idx + 1].row.key)}>
            Phép đo sau
          </button>
        </div>
      </header>

      <section className={`statement lv-border-${r.classification.id}`}>
        <p className="statement-text">
          <LevelBadge c={r.classification} /> {r.action}. <InternalTag />
        </p>
        <Warnings items={r.warnings} />
        <SetupCompare r={r} std={std} row={rr.row} byId={byId} onPick={(field, id) => onPick(rr.row.key, field, id)} />
      </section>

      <div className="tabs" role="tablist" aria-label="Nội dung phép đo">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={tab === t.id ? "tab on" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "compare" && (
          <>
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
            {backdrop === "dlt911" && <p className="muted small">Mỗi dải ghi Rxy, tô màu theo mức Bảng A.1.</p>}
            <Plot key={`bode${fit}`} data={plots.bode.data} layout={plots.bode.layout} height={640} />
            <h3>Hiệu số biên độ ΔdB</h3>
            <Plot key={`diff${fit}`} data={plots.diff.data} layout={plots.diff.layout} height={260} />
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
          </>
        )}

        {tab === "dlt911" && <Dlt911Tab r={r} std={std} />}

        {tab === "peaks" && (
          <>
            <p className="muted small">Đặc tả mục 6.4. Ghép đỉnh/hố của lần đo với baseline và tính độ dịch tần.</p>
            <PeakTable pa={r.peaks} std={std} />
          </>
        )}

        {tab === "tb812" && (
          <>
            <h3>Theo dải DL/T 911 (tham khảo)</h3>
            <p className="muted small">
              {std.tb812.source}. {std.tb812.note} {std.tb812.data_size_note}.
            </p>
            <Tb812Table ranges={r.tb812Bands} std={std} />
            <h3>Theo vùng IEC 60076-18 (tham khảo)</h3>
            <p className="muted small">
              {std.iec_zones.source}. {std.iec_zones.note}. Rxy tính theo công thức DL/T 911 Phụ lục A, không áp ngưỡng.
            </p>
            <Tb812Table ranges={r.tb812Zones} std={std} showRxy />
          </>
        )}
      </section>
    </div>
  );
}

/** Baseline and test side by side: file, time and test configuration, with differences marked. */
function SetupCompare({ r, std, row, byId, onPick }: {
  r: PairResult;
  std: Standards;
  row: PairRow;
  byId: Map<string, Trace>;
  onPick: (field: "baselineId" | "testId", id: string) => void;
}) {
  const codes = new Set(r.warnings.map((w) => w.code));
  const cfg = (t: Trace) => (measurementConfig(t) === "open" ? "Hở mạch" : "Nối tắt");
  const fields = std.quality.pair.compare_fields as Record<string, string>;
  const KEYS: Record<string, (t: Trace) => string> = {
    measurement_type: cfg,
    shorted_terminal: (t) => t.setting.shortedTerminal,
    grounded_terminal: (t) => t.setting.groundedTerminal,
    ltc_position: (t) => t.setting.ltcPosition,
    detc_position: (t) => t.setting.detcPosition,
  };
  const rows: { label: string; get: (t: Trace) => string; differs: boolean }[] = [
    { label: "Thời điểm đo", get: (t) => fmtDateTime(t.testDate), differs: false },
    {
      label: "Đầu đỏ → đầu đen",
      get: (t) => `${t.setting.redLead || "–"} → ${t.setting.blackLead || "–"}`,
      differs: codes.has("reversed_leads") || codes.has("different_leads"),
    },
    ...Object.entries(fields).map(([attr, label]) => ({ label, get: KEYS[attr] ?? (() => ""), differs: codes.has(`diff_${attr}`) })),
  ];
  const picker = (field: "baselineId" | "testId", cur: Trace, other: Trace) => (
    <select aria-label={field === "baselineId" ? "File baseline" : "File lần đo"} value={cur.id} onChange={(e) => onPick(field, e.target.value)}>
      {row.candidates
        .filter((id) => id !== other.id && byId.has(id))
        .map((id) => {
          const t = byId.get(id)!;
          return (
            <option key={id} value={id}>
              {sessionLabel(dayKey(t.testDate))}: {t.sourceName}
            </option>
          );
        })}
    </select>
  );
  return (
    <div className="table-wrap">
      <table className="grid small setup-compare">
        <thead>
          <tr>
            <th></th>
            <th>
              <span className="curve-key base" aria-hidden="true" /> Baseline
            </th>
            <th>
              <span className="curve-key test" aria-hidden="true" /> Lần đo
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">File</th>
            <td>{picker("baselineId", r.baseline, r.test)}</td>
            <td>{picker("testId", r.test, r.baseline)}</td>
          </tr>
          {rows.map((x) => (
            <tr key={x.label} className={x.differs ? "differs" : ""}>
              <th scope="row">
                {x.label}
                {x.differs && <span className="tag-differs">Khác nhau</span>}
              </th>
              <td>{x.get(r.baseline) || "–"}</td>
              <td>{x.get(r.test) || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Rxy per band coloured by the Table A.1 level it points to, the intermediate sums, and the colour key. */
function Dlt911Tab({ r, std }: { r: PairResult; std: Standards }) {
  const bands = Object.values(r.bands);
  const levels = levelConditions(std, (v) => fmtNum(v, std, 1));
  return (
    <>
      <div className="band-tiles">
        {bands.map((b) => {
          const lv = bandLevel(b.band, b.rxy, std);
          return (
            <div key={b.band} className={`band-tile v-${lv?.id ?? "none"}`}>
              <div className="band-tile-head">
                <strong>R{b.band}</strong>
                <span>
                  {fmtHzShort(b.f_min)} – {fmtHzShort(b.f_max)}
                </span>
              </div>
              <div className="band-tile-value">{fmtNum(b.rxy, std, 3)}</div>
              <div className="band-tile-foot">
                <span>Ngưỡng bình thường ≥ {fmtNum(b.threshold, std, 1)}</span>
                <span className="band-tile-level">{lv?.label ?? "Không tính được"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <section className={`statement lv-border-${r.classification.id}`}>
        <p className="statement-text">
          Kết luận theo Bảng A.1: <LevelBadge c={r.classification} />
        </p>
        <p className="muted small">
          Bảng A.1 được xét từ mức nặng đến mức nhẹ, mức đầu tiên thỏa điều kiện là kết luận. Màu của từng ô là mức mà riêng hệ số của
          dải đó chỉ ra. Căn cứ: {r.classification.source}.
        </p>
        {r.classification.note && <p className="note">{r.classification.note}</p>}
      </section>

      <h3>Mã màu và ý nghĩa</h3>
      <div className="table-wrap">
        <table className="grid level-key">
          <thead>
            <tr>
              <th>Mức</th>
              <th>Điều kiện</th>
              <th>
                Hành động gợi ý <InternalTag />
              </th>
              <th>Căn cứ</th>
            </tr>
          </thead>
          <tbody>
            {levels.map(({ level, text }) => (
              <tr key={level.id} className={level.id === r.classification.id ? "current" : ""}>
                <td>
                  <span className={`swatch v-${level.id}`} aria-hidden="true" />
                  <strong>{level.label}</strong>
                  <div className="muted small">{level.label_en}</div>
                  {level.id === r.classification.id && <div className="small strong">Kết quả phép đo này</div>}
                </td>
                <td className="small">
                  {text}
                  {level.note && level.id !== "insufficient" && <div className="muted">{level.note}</div>}
                </td>
                <td className="small">{std.actions.by_level[level.id] ?? ""}</td>
                <td className="muted small">
                  {level.in_standard ? "" : "Không thuộc DL/T 911. "}
                  {level.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Bảng tính trung gian (DL/T 911-2004, Phụ lục A)</h3>
      <p className="muted small">
        X = biên độ baseline (dB), Y = biên độ lần đo (dB) trên cùng tập tần số. X̄ = ΣX/N; Dx = Σ(X−X̄)²/N; Dy = Σ(Y−Ȳ)²/N; Cxy =
        Σ(X−X̄)(Y−Ȳ)/N; LRxy = Cxy/√(Dx·Dy); Rxy = 10 nếu 1−LRxy &lt; 10⁻¹⁰, ngược lại −log₁₀(1−LRxy).
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
                <td className={`num strong v-${bandLevel(b.band, b.rxy, std)?.id ?? "none"}`}>{fmtNum(b.rxy, std, 4)}</td>
                <td className="num">≥ {fmtNum(b.threshold, std, 1)}</td>
                <td className="muted small">{b.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bands.some((b) => b.note) && (
        <Warnings items={bands.filter((b) => b.note).map((b) => ({ code: "band", severity: "warning", message: `${b.band}: ${b.note}`, source: b.source }))} />
      )}
    </>
  );
}
