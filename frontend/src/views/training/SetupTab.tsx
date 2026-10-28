/** Module 2: measurement configurations (IEC 60076-18 2.6–2.9) and the preparation checklist. */
import { useState } from "react";
import { TRAINING } from "../../core/training/content";
import { SetupDiagram } from "../../components/training/Diagrams";
import { Source } from "./shared";

export default function SetupTab() {
  const [id, setId] = useState(TRAINING.setups[0].id);
  const [done, setDone] = useState<Set<string>>(new Set());
  const setup = TRAINING.setups.find((s) => s.id === id) ?? TRAINING.setups[0];
  const all = TRAINING.checklist.flatMap((g) => g.items.map((_, i) => `${g.group}-${i}`));
  return (
    <div className="training-tab">
      <section className="theory-section">
        <h2>Bốn kiểu đo</h2>
        <div className="chips" role="tablist" aria-label="Kiểu đo">
          {TRAINING.setups.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === id} className={s.id === id ? "chip on" : "chip"} onClick={() => setId(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="setup-view">
          <SetupDiagram setup={setup} />
          <div>
            <h3>{setup.label}</h3>
            <p>{setup.definition}</p>
            <ul className="setup-legend">
              <li>
                <span className="lead-key vin" aria-hidden="true" /> Dây nguồn và dây chuẩn (V_in): đầu {setup.vin}
              </li>
              <li>
                <span className="lead-key vout" aria-hidden="true" /> Dây đáp ứng (V_out, đo trên 50 Ω): đầu {setup.vout}
              </li>
              {setup.shorted.length > 0 && <li>Nối tắt: {setup.shorted.join(" – ")}</li>}
              {setup.grounded.length > 0 && <li>Nối đất: {setup.grounded.join(", ")}</li>}
              <li className="muted">Các đầu còn lại để hở.</li>
            </ul>
            <p className="note">{setup.note}</p>
            <Source>{setup.source}</Source>
          </div>
        </div>
      </section>

      <section className="theory-section">
        <div className="row between wrap">
          <h2>Danh mục kiểm tra trước và trong khi đo</h2>
          <span className="muted">
            Đã đánh dấu {done.size}/{all.length}
            {done.size > 0 && (
              <>
                {" "}
                <button className="link" onClick={() => setDone(new Set())}>
                  Bỏ đánh dấu
                </button>
              </>
            )}
          </span>
        </div>
        {TRAINING.checklist.map((g) => (
          <div key={g.group} className="checklist">
            <h3>{g.group}</h3>
            <ul>
              {g.items.map((it, i) => {
                const key = `${g.group}-${i}`;
                return (
                  <li key={key}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={done.has(key)}
                        onChange={(e) =>
                          setDone((d) => {
                            const next = new Set(d);
                            if (e.target.checked) next.add(key);
                            else next.delete(key);
                            return next;
                          })
                        }
                      />
                      <span>
                        {it.text} <Source>{it.source}</Source>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
