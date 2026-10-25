import { useState } from "react";
import type { RangeIndices } from "../core/analysis";
import { peakStatusLabel, type PeakAnalysis } from "../core/peaks";
import { fmtHz } from "../core/quality";
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
              <td>
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
  const notable = pa.matches.filter((m) => m.status !== "ok");
  const rows = all ? pa.matches : pa.matches.filter((m) => m.status !== "ok" || m.band === "LF" || m.band === "MF" || m.band === "HF");
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
