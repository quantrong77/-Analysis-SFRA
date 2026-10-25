import { useMemo, useState } from "react";
import { decodeBytes } from "../core/parsers/common";
import { splitLine } from "../core/parsers/fraV2Csv";
import { signatureOf, type CsvProfile, type CsvSniff } from "../core/parsers/genericCsv";

export interface PendingMapping {
  filename: string;
  bytes: Uint8Array;
  sniff: CsvSniff;
}

interface Props {
  item: PendingMapping;
  sameHeaderCount: number;
  onSubmit: (profile: CsvProfile) => void;
  onCancel: () => void;
}

const DELIMS: [string, string][] = [[";", "Chấm phẩy ;"], [",", "Phẩy ,"], ["\t", "Tab"]];

/** Column mapping for a CSV the parser could not recognise with certainty (spec 4.2). */
export default function CsvMapping({ item, sameHeaderCount, onSubmit, onCancel }: Props) {
  const [p, setP] = useState<CsvProfile>({ ...item.sniff.guess, name: "" });
  const lines = useMemo(() => decodeBytes(item.bytes.subarray(0, 20000)).text.replace(/^﻿/, "").split(/\r\n|\n|\r/).slice(0, 40), [item.bytes]);
  const rows = lines.map((l) => splitLine(l, p.delimiter).map((c) => c.trim()));
  const header = p.headerRow >= 0 ? rows[p.headerRow] ?? [] : [];
  const nCols = Math.max(...rows.slice(p.headerRow + 1, p.headerRow + 10).map((r) => r.length), 1);
  const colName = (i: number) => `Cột ${i + 1}${header[i] ? ` – ${header[i]}` : ""}`;
  const set = <K extends keyof CsvProfile>(k: K, v: CsvProfile[K]) => setP({ ...p, [k]: v });
  const cols = Array.from({ length: nCols }, (_, i) => i);

  return (
    <section className="panel mapping">
      <h3>Ánh xạ cột: {item.filename}</h3>
      <ul className="warns">
        {item.sniff.reasons.map((r, i) => (
          <li key={i} className="warning">
            {r}
          </li>
        ))}
      </ul>
      <div className="form-grid">
        <label className="field">
          <span>Dấu phân cách</span>
          <select value={p.delimiter} onChange={(e) => set("delimiter", e.target.value)}>
            {DELIMS.map(([v, l]) => (
              <option key={l} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dòng tiêu đề (0 = không có)</span>
          <input type="number" min={0} max={30} value={p.headerRow + 1} onChange={(e) => set("headerRow", Number(e.target.value) - 1)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={p.decimalComma} onChange={(e) => set("decimalComma", e.target.checked)} /> Dấu thập phân là dấu phẩy
        </label>
        <label className="field">
          <span>Cột tần số</span>
          <select value={p.freqCol} onChange={(e) => set("freqCol", Number(e.target.value))}>
            {cols.map((i) => (
              <option key={i} value={i}>
                {colName(i)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Đơn vị tần số</span>
          <select value={p.freqUnit} onChange={(e) => set("freqUnit", e.target.value as CsvProfile["freqUnit"])}>
            <option>Hz</option>
            <option>kHz</option>
            <option>MHz</option>
          </select>
        </label>
        <label className="field">
          <span>Cột biên độ</span>
          <select value={p.magCol} onChange={(e) => set("magCol", Number(e.target.value))}>
            {cols.map((i) => (
              <option key={i} value={i}>
                {colName(i)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Đơn vị biên độ</span>
          <select value={p.magUnit} onChange={(e) => set("magUnit", e.target.value as CsvProfile["magUnit"])}>
            <option value="dB">dB</option>
            <option value="linear">Tỷ số tuyến tính (đổi 20·log10)</option>
          </select>
        </label>
        <label className="field">
          <span>Cột góc pha</span>
          <select value={p.phaseCol ?? -1} onChange={(e) => set("phaseCol", Number(e.target.value) < 0 ? null : Number(e.target.value))}>
            <option value={-1}>— không có —</option>
            {cols.map((i) => (
              <option key={i} value={i}>
                {colName(i)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Đơn vị góc pha</span>
          <select value={p.phaseUnit} onChange={(e) => set("phaseUnit", e.target.value as CsvProfile["phaseUnit"])}>
            <option value="deg">Độ</option>
            <option value="rad">Radian</option>
          </select>
        </label>
        <label className="field wide">
          <span>Tên hồ sơ hãng (dùng lại cho các file cùng tiêu đề)</span>
          <input value={p.name} placeholder="VD: Omicron FRAnalyzer" onChange={(e) => set("name", e.target.value)} />
        </label>
      </div>

      <div className="table-wrap">
        <table className="grid small">
          <tbody>
            {rows.slice(0, 14).map((r, i) => (
              <tr key={i} className={i === p.headerRow ? "hdr-row" : i < p.headerRow ? "dim" : ""}>
                <td className="muted">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c} className={c === p.freqCol ? "col-f" : c === p.magCol ? "col-m" : c === p.phaseCol ? "col-p" : ""}>
                    {r[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row gap wrap">
        <button
          className="primary"
          disabled={!p.name.trim() || p.freqCol === p.magCol}
          onClick={() => onSubmit({ ...p, id: `${Date.now()}`, name: p.name.trim(), signature: signatureOf(header) })}
        >
          Lưu hồ sơ và đọc file{sameHeaderCount > 1 ? ` (${sameHeaderCount} file cùng tiêu đề)` : ""}
        </button>
        <button onClick={onCancel}>Bỏ qua file này</button>
        <span className="muted small">Tô màu: xanh = tần số, đỏ = biên độ, tím = góc pha.</span>
      </div>
    </section>
  );
}
