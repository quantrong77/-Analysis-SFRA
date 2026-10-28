/** Module 1: theory and standards, every statement with the clause it comes from. */
import { fmtHzShort } from "../../core/quality";
import { frequencyPartitions, type Standards } from "../../core/standards";
import { TRAINING } from "../../core/training/content";
import { LadderDiagram, TimeFreqDiagram } from "../../components/training/Diagrams";
import { Source } from "./shared";

const range = (lo: number, hi: number) =>
  lo <= 0 ? `dưới ${fmtHzShort(hi)}` : Number.isFinite(hi) && hi < 1e11 ? `${fmtHzShort(lo)} – ${fmtHzShort(hi)}` : `trên ${fmtHzShort(lo)}`;

/** Voltage ratios worth knowing by heart, in dB (20·log10) */
const DB_ROWS: { ratio: number; text: string; note: string }[] = [
  { ratio: 10, text: "10", note: "Vout lớn gấp 10 lần Vin" },
  { ratio: 2, text: "2", note: "Vout gấp đôi Vin" },
  { ratio: 1, text: "1", note: "Vout bằng Vin" },
  { ratio: Math.SQRT1_2, text: "0,707 (1/√2)", note: "Một nửa công suất" },
  { ratio: 0.5, text: "0,5", note: "Vout bằng một nửa Vin" },
  { ratio: 0.1, text: "0,1", note: "Nhỏ đi 10 lần" },
  { ratio: 0.01, text: "0,01", note: "Nhỏ đi 100 lần" },
  { ratio: 0.001, text: "0,001", note: "Nhỏ đi 1 000 lần" },
  { ratio: 1e-4, text: "0,0001", note: "Nhỏ đi 10 000 lần" },
];
const dbText = (r: number) => {
  const v = 20 * Math.log10(r);
  const exact = Math.abs(v - Math.round(v)) < 1e-9;
  return `${exact ? "" : "≈ "}${v > 0.05 ? "+" : ""}${v.toFixed(0)}`.replace("-", "−");
};

export default function TheoryTab({ std, onOpenLab }: { std: Standards; onOpenLab?: () => void }) {
  const iec = std.iec_zones ?? {};
  const zones = Object.values((iec.zones ?? {}) as Record<string, { label: string; f_min: number; f_max: number; influence?: string }>);
  return (
    <div className="training-tab">
      <nav className="toc" aria-label="Mục lục lý thuyết">
        {TRAINING.theory.map((s) => (
          <a key={s.id} href={`#th-${s.id}`}>
            {s.title}
          </a>
        ))}
        <a href="#th-zones">Ảnh hưởng theo vùng tần số</a>
        <a href="#th-partitions">So sánh cách chia dải</a>
        <a href="#th-bibliography">Tài liệu tham khảo</a>
      </nav>

      {TRAINING.theory.map((s) => (
        <section key={s.id} id={`th-${s.id}`} className="theory-section">
          <h2>{s.title}</h2>
          {s.id === "circuit" && <LadderDiagram />}
          {s.id === "signals" && <TimeFreqDiagram />}
          <ul className="sourced">
            {s.items.map((it, i) => (
              <li key={i}>
                {it.text} <Source>{it.source}</Source>
              </li>
            ))}
          </ul>
          {s.id === "transfer" && onOpenLab && (
            <p className="theory-try">
              Xem trực quan Vin đi qua hàm truyền thành Vout, đáp ứng biên độ và pha ở từng tần số:{" "}
              <button className="link" onClick={onOpenLab}>
                mở Lab hàm truyền
              </button>
              .
            </p>
          )}
          {s.id === "decibel" && (
            <div className="table-wrap db-table">
              <table className="grid small">
                <caption>Quy đổi tỉ số điện áp sang dB, tính theo 20 × log10(Vout / Vin)</caption>
                <thead>
                  <tr>
                    <th className="num">Vout / Vin</th>
                    <th className="num">dB</th>
                    <th>Ý nghĩa</th>
                  </tr>
                </thead>
                <tbody>
                  {DB_ROWS.map((r) => (
                    <tr key={r.text}>
                      <td className="num">{r.text}</td>
                      <td className="num">{dbText(r.ratio)}</td>
                      <td>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <section id="th-zones" className="theory-section">
        <h2>Ảnh hưởng theo vùng tần số</h2>
        <div className="table-wrap">
          <table className="grid small">
            <thead>
              <tr>
                <th>Vùng</th>
                <th>Dải tần</th>
                <th>Thành phần ảnh hưởng chính</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.label}>
                  <td className="nowrap">
                    <strong>{z.label}</strong>
                  </td>
                  <td className="nowrap">{range(z.f_min, z.f_max)}</td>
                  <td>{z.influence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Source>{`${iec.influence_source ?? iec.source}. ${iec.influence_note ?? ""}`}</Source>
      </section>

      <section id="th-partitions" className="theory-section">
        <h2>So sánh cách chia dải giữa các tài liệu</h2>
        <div className="table-wrap">
          <table className="grid small">
            <thead>
              <tr>
                <th>Tài liệu</th>
                <th>Các vùng</th>
                <th>Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {frequencyPartitions(std).map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">
                    <strong>{p.label}</strong>
                  </td>
                  <td>
                    {p.zones.map((z) => (
                      <div key={z.key}>
                        {z.label}: {range(z.f_min, z.f_max)}
                      </div>
                    ))}
                  </td>
                  <td className="muted">{p.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Chỉ DL/T 911-2004 gắn ngưỡng đánh giá (Rxy, Bảng A.1) với các dải; các tài liệu khác dùng dải để giải thích thành phần ảnh hưởng.
        </p>
      </section>

      <section id="th-bibliography" className="theory-section">
        <h2>Tài liệu tham khảo</h2>
        <p className="muted small">Tên viết tắt ở cột nguồn ứng với các tài liệu dưới đây; số mục của giáo trình theo đúng lần xuất bản ghi kèm.</p>
        <dl className="bibliography">
          {TRAINING.bibliography.map((b) => (
            <div key={b.key}>
              <dt>{b.key}</dt>
              <dd>{b.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
