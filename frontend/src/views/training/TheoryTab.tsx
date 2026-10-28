/** Module 1: theory and standards, every statement with the clause it comes from. */
import { fmtHzShort } from "../../core/quality";
import { frequencyPartitions, type Standards } from "../../core/standards";
import { TRAINING } from "../../core/training/content";
import { LadderDiagram } from "../../components/training/Diagrams";
import { Source } from "./shared";

const range = (lo: number, hi: number) =>
  lo <= 0 ? `dưới ${fmtHzShort(hi)}` : Number.isFinite(hi) && hi < 1e11 ? `${fmtHzShort(lo)} – ${fmtHzShort(hi)}` : `trên ${fmtHzShort(lo)}`;

export default function TheoryTab({ std }: { std: Standards }) {
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
      </nav>

      {TRAINING.theory.map((s) => (
        <section key={s.id} id={`th-${s.id}`} className="theory-section">
          <h2>{s.title}</h2>
          {s.id === "circuit" && <LadderDiagram />}
          <ul className="sourced">
            {s.items.map((it, i) => (
              <li key={i}>
                {it.text} <Source>{it.source}</Source>
              </li>
            ))}
          </ul>
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
    </div>
  );
}
