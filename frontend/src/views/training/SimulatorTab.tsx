/** Module 3: failure modes simulated on the teaching ladder model, compared with the healthy winding. */
import { useMemo, useState } from "react";
import { analyzePair } from "../../core/analysis";
import type { Standards } from "../../core/standards";
import { TRAINING } from "../../core/training/content";
import { simulate, type FaultId, type Where } from "../../core/training/faults";
import { logFreq, response, type TestType } from "../../core/training/ladder";
import { AppAnalysis, PairPlot, Source, synthTrace } from "./shared";

// faults that sit in one part of the winding; the others act on the whole winding or the core
const LOCAL = new Set<FaultId>(["radial", "axial", "turn_short", "open_winding"]);
const WHERE: { id: Where; label: string }[] = [
  { id: "start", label: "Đầu cuộn dây" },
  { id: "middle", label: "Giữa cuộn dây" },
  { id: "end", label: "Cuối cuộn dây" },
];
const FREQ = logFreq();

export default function SimulatorTab({ std }: { std: Standards }) {
  const faults = TRAINING.faults.filter((f) => f.simulated);
  const [fault, setFault] = useState<FaultId>("axial");
  const [severity, setSeverity] = useState(60);
  const [where, setWhere] = useState<Where>("middle");
  const [test, setTest] = useState<TestType>("open");
  const info = faults.find((f) => f.id === fault)!;

  const r = useMemo(() => {
    const healthy = simulate("none", 0);
    const bad = simulate(fault, severity / 100, where);
    const h = response(healthy.model, healthy.scale, test, FREQ);
    const b = response(bad.model, bad.scale, test, FREQ);
    return analyzePair(synthTrace("sim-ref", "Cuộn dây lành", FREQ, h.magDb, h.phaseDeg), synthTrace("sim-test", info.label, FREQ, b.magDb, b.phaseDeg), std, {
      label: info.label,
    });
  }, [fault, severity, where, test, std, info.label]);

  return (
    <div className="training-tab">
      <p className="note">
        Mô hình mạch hình thang của một cuộn dây (IEEE C57.149 6.6 và Phụ lục A) với tham số chọn để đường cong có hình dạng điển hình. Đồ thị minh họa
        xu hướng thay đổi khi có hư hỏng, không phải số liệu của máy thật, không dùng để chẩn đoán. Không mô phỏng dịch chuyển tổng thể và cuộn dây lỏng:
        mô hình không có hỗ cảm giữa các đoạn nên cho kết quả trái với IEEE C57.149 Bảng 9 và 14.
      </p>
      <div className="sim-controls">
        <label className="field">
          <span>Dạng hư hỏng</span>
          <select value={fault} onChange={(e) => setFault(e.target.value as FaultId)}>
            {faults.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field sim-severity">
          <span>Mức độ: {severity} %</span>
          <input type="range" min={0} max={100} step={5} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} />
        </label>
        {LOCAL.has(fault) && (
          <label className="field">
            <span>Vị trí</span>
            <select value={where} onChange={(e) => setWhere(e.target.value as Where)}>
              {WHERE.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="field">
          <span>Phép đo</span>
          <div className="seg" role="radiogroup" aria-label="Phép đo">
            {(
              [
                ["open", "Hở mạch"],
                ["short", "Ngắn mạch"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={test === id} className={test === id ? "on" : ""} onClick={() => setTest(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="fault-card">
        <h3>{info.label}</h3>
        <p>{info.summary}</p>
        <div className="table-wrap">
          <table className="grid small">
            <thead>
              <tr>
                <th>Dải tần</th>
                <th>Biểu hiện trên đồ thị</th>
              </tr>
            </thead>
            <tbody>
              {info.regions.map((x) => (
                <tr key={x.range}>
                  <td className="nowrap">{x.range}</td>
                  <td>{x.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Source>{info.source}</Source>
      </section>

      <PairPlot key={`${fault}`} r={r} std={std} names={["Cuộn dây lành", `${info.label} ${severity} %`]} />
      <h3>Phân tích của app trên cặp đường mô phỏng</h3>
      <AppAnalysis r={r} std={std} />
    </div>
  );
}
