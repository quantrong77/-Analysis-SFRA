import { useState } from "react";
import type { RangeIndices } from "../core/analysis";
import { peakCounts, peakStatusLabel, type PeakAnalysis } from "../core/peaks";
import { fmtHz, fmtHzShort } from "../core/quality";
import { fmtNum } from "../core/rules";
import type { Standards } from "../core/standards";
import { InternalTag } from "./common";

interface IdxCfg {
  id: string;
  name: string;
  equation: string;
  ideal: number;
  unit?: string;
  note?: string;
}

/** CIGRE TB 812 indices per range (DL/T bands or IEC zones). Values only, no thresholds. */
export function Tb812Table({ ranges, std, showRxy }: { ranges: RangeIndices[]; std: Standards; showRxy?: boolean }) {
  const idx = std.tb812.indices as IdxCfg[];
  return (
    <div className="table-wrap">
      <table className="grid mono">
        <thead>
          <tr>
            <th>Vùng</th>
            <th>Dải tần</th>
            <th className="num">N</th>
            {showRxy && <th className="num" title="DL/T 911-2004 Phụ lục A, không áp ngưỡng cho vùng IEC">Rxy</th>}
            {idx.map((i) => (
              <th key={i.id} className="num" title={`${i.name}${i.equation ? ` – TB 812 phương trình ${i.equation}` : ""}${i.note ? `. ${i.note}` : ""}`}>
                {i.id === "MAXABS" ? "max|ΔdB|" : i.id}
                <div className="th-sub">{i.equation ? `(${i.equation})` : "bổ sung"} lý tưởng {i.ideal}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranges.map((r) => (
            <tr key={r.key}>
              <td className="nowrap">
                <strong>{r.key.length <= 2 ? r.key : ""}</strong> {r.label}
              </td>
              <td className="nowrap">
                {fmtHz(r.f_min)} – {r.f_max > 1e12 ? "∞" : fmtHz(r.f_max)}
              </td>
              <td className="num">{r.n}</td>
              {showRxy && <td className="num">{fmtNum(r.rxy, std, 3)}</td>}
              {idx.map((i) => (
                <td key={i.id} className="num">
                  {fmtNum(r.tb812[i.id as keyof typeof r.tb812], std, i.ideal === 1 ? 4 : 3)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Matched resonance peaks / notches with frequency shift (spec 6.4). */
export function PeakTable({ pa, std, refLabel = "Baseline", testLabel = "Lần đo" }: { pa: PeakAnalysis; std: Standards; refLabel?: string; testLabel?: string }) {
  const [all, setAll] = useState(false);
  const [only, setOnly] = useState<"all" | "new" | "lost">("all");
  const notable = pa.matches.filter((m) => m.status !== "ok");
  const inBands = (b: string) => b in std.dlt911.bands;
  const rows = (all ? pa.matches : pa.matches.filter((m) => m.status !== "ok" || inBands(m.band))).filter(
    (m) => only === "all" || m.status === only,
  );
  const counts = peakCounts(pa, std);
  const inside = counts.filter((c) => c.band !== "outside");
  const sum = (k: "peaksNew" | "peaksLost" | "notchesNew" | "notchesLost") => inside.reduce((s, c) => s + c[k], 0);
  const bandNames = Object.keys(std.dlt911.bands);
  const first = std.dlt911.bands[bandNames[0]];
  const last = std.dlt911.bands[bandNames[bandNames.length - 1]];
  const range = `${fmtHzShort(first.f_min)} – ${fmtHzShort(last.f_max)}`;
  const cell = (n: number) => <td className={`num${n ? " pk-count-on" : ""}`}>{n}</td>;
  const th = std.peaks.shift_thresholds_percent;
  const maxShift = pa.matches.reduce((m, x) => (x.shiftPercent !== null && Math.abs(x.shiftPercent) > Math.abs(m) ? x.shiftPercent : m), 0);
  return (
    <>
      <p className="small">
        {pa.ref.length} cực trị ở {refLabel.toLowerCase()}, {pa.test.length} ở {testLabel.toLowerCase()} (prominence ≥{" "}
        {fmtNum(pa.prominence, std, 1)} dB, ghép trong cửa sổ ±{fmtNum(pa.window * 100, std, 0)} %, dải {fmtHz(pa.fLo)} – {fmtHz(pa.fHi)}).{" "}
        {pa.matches.filter((m) => m.ref && m.test).length} cặp ghép được; dịch lớn nhất {fmtNum(maxShift, std, 2)} %;{" "}
        {notable.length} mục cần chú ý. Ngưỡng dịch {th.warning} % / {th.alarm} %: <InternalTag />
      </p>
      <div className="peak-tiles">
        {[
          { label: "Đỉnh cộng hưởng mới", n: sum("peaksNew") },
          { label: "Đỉnh cộng hưởng mất", n: sum("peaksLost") },
          { label: "Hố (phản cộng hưởng) mới", n: sum("notchesNew") },
          { label: "Hố (phản cộng hưởng) mất", n: sum("notchesLost") },
        ].map((t) => (
          <div key={t.label} className={`peak-tile${t.n ? " on" : ""}`}>
            <span className="peak-tile-n">{t.n}</span>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
      <p className="muted small">
        Đếm trong dải {range}. Mới: có ở {testLabel.toLowerCase()}, không ghép được với {refLabel.toLowerCase()}. Mất: có ở{" "}
        {refLabel.toLowerCase()}, không còn ở {testLabel.toLowerCase()}.
      </p>
      <div className="table-wrap">
        <table className="grid small peak-counts">
          <thead>
            <tr>
              <th>Dải</th>
              <th className="num">Đỉnh mới</th>
              <th className="num">Đỉnh mất</th>
              <th className="num">Hố mới</th>
              <th className="num">Hố mất</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.band} className={c.band === "outside" ? "muted" : ""}>
                <td>
                  {c.band === "outside"
                    ? `Ngoài ${range}`
                    : `${c.band} (${fmtHzShort(std.dlt911.bands[c.band].f_min)} – ${fmtHzShort(std.dlt911.bands[c.band].f_max)})`}
                </td>
                {cell(c.peaksNew)}
                {cell(c.peaksLost)}
                {cell(c.notchesNew)}
                {cell(c.notchesLost)}
              </tr>
            ))}
            <tr className="total">
              <td>Tổng trong {range}</td>
              {cell(sum("peaksNew"))}
              {cell(sum("peaksLost"))}
              {cell(sum("notchesNew"))}
              {cell(sum("notchesLost"))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="row between wrap">
        <h3>Danh sách cực trị</h3>
        <div className="chips">
          {([["all", "Tất cả"], ["new", "Chỉ mới"], ["lost", "Chỉ mất"]] as const).map(([id, label]) => (
            <button key={id} className={only === id ? "chip on" : "chip"} onClick={() => setOnly(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="grid mono small">
          <thead>
            <tr>
              <th>Loại</th>
              <th>Dải</th>
              <th className="num">f {refLabel.toLowerCase()}</th>
              <th className="num">f {testLabel.toLowerCase()}</th>
              <th className="num">Δf</th>
              <th className="num">Dịch tần (%)</th>
              <th className="num">dB {refLabel.toLowerCase()}</th>
              <th className="num">ΔdB</th>
              <th>Đánh giá</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={i} className={`pk-${m.status}`}>
                <td>{m.kind === "peak" ? "Đỉnh" : "Hố"}</td>
                <td>{m.band}</td>
                <td className="num">{m.ref ? fmtHz(m.ref.freq) : "–"}</td>
                <td className="num">{m.test ? fmtHz(m.test.freq) : "–"}</td>
                <td className="num">{m.deltaHz === null ? "–" : fmtHz(Math.abs(m.deltaHz)).replace(/^/, m.deltaHz < 0 ? "−" : "+")}</td>
                <td className="num">{fmtNum(m.shiftPercent, std, 2)}</td>
                <td className="num">{fmtNum((m.ref ?? m.test)!.db, std, 2)}</td>
                <td className="num">{fmtNum(m.deltaDb, std, 2)}</td>
                <td>{peakStatusLabel(m.status, std)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="check small">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Hiện cả cực trị ngoài dải 1 kHz – 1 MHz
      </label>
      <p className="muted small">Căn cứ định tính: {std.peaks.qualitative_source}.</p>
    </>
  );
}
