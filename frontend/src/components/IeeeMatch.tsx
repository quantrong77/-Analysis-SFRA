/** What changed in each frequency band of a real pair, and the IEEE C57.149 failure modes that pattern fits. */
import type { PairResult } from "../core/analysis";
import type { Standards } from "../core/standards";
import { TRAINING } from "../core/training/content";
import { interpret, likely } from "../core/training/interpret";

const STATE: Record<string, { text: string; cls: string }> = {
  changed: { text: "Có thay đổi", cls: "state changed" },
  unchanged: { text: "Không đổi rõ", cls: "state unchanged" },
  no_data: { text: "Ngoài dải đo", cls: "state nodata" },
};
const recLabel = (id: string) => TRAINING.recommendations.find((r) => r.id === id);

export default function IeeeMatch({ r, std }: { r: PairResult; std: Standards }) {
  const it = interpret(r, std);
  const cfg = std.interpretation ?? {};
  const shown = likely(it, 3);
  const nothing = shown.length === 1 && shown[0].fault.id === "none";
  return (
    <div className="ieee-match">
      <p className="note">
        Gợi ý tham khảo, đối chiếu các vùng tần số thay đổi với mô tả của từng dạng hư hỏng trong {cfg.source ?? "IEEE Std C57.149-2012, 6.5"}. Không
        thay cho đánh giá của người phân tích: kết hợp với Rxy, đỉnh cộng hưởng, các phép đo khác của máy và các thí nghiệm đối chiếu (IEEE C57.149 6.4).
      </p>
      <p>
        Phép đo đang xem: <strong>{it.test === "open" ? "hở mạch (đầu – cuối)" : "ngắn mạch (có cuộn dây nối tắt)"}</strong>, đọc từ cấu hình trong file
        đo. Dấu hiệu của mỗi dạng hư hỏng khác nhau giữa hai loại phép đo.
      </p>

      <h3>Thay đổi theo vùng tần số</h3>
      <div className="table-wrap">
        <table className="grid small">
          <thead>
            <tr>
              <th>Vùng (IEEE C57.149)</th>
              <th className="num">|ΔdB| P90</th>
              <th className="num">|ΔdB| lớn nhất</th>
              <th className="num">Cộng hưởng dịch mạnh / mất / mới</th>
              <th>Nhận định</th>
            </tr>
          </thead>
          <tbody>
            {it.regions.map((x) => (
              <tr key={x.id}>
                <td className="nowrap">{x.label}</td>
                <td className="num">{x.p90 === null ? "–" : x.p90.toFixed(1)}</td>
                <td className="num">{x.max === null ? "–" : x.max.toFixed(1)}</td>
                <td className="num">
                  {x.shifted} / {x.lost} / {x.added}
                </td>
                <td>
                  <span className={STATE[x.state].cls}>{STATE[x.state].text}</span>
                  {x.why.length > 0 && <div className="muted small">{x.why.join("; ")}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Vùng có thay đổi khi |ΔdB| ở phân vị 90 từ {cfg.db_p90_changed ?? 3} dB, hoặc có cộng hưởng dịch vượt ngưỡng cảnh báo cao, mất hoặc mới (mục Đỉnh
        cộng hưởng). {cfg.threshold_source}
      </p>
      {Object.values(it.features).length > 0 && (
        <p>
          Dấu hiệu riêng: {Object.values(it.features).join("; ")}.
        </p>
      )}

      {it.skipped && <p className="note">{it.skipped}</p>}
      {it.coreOnly && (
        <p className="note">
          Khi đo hở mạch chỉ vùng lõi thay đổi. Cần loại trừ từ dư trước: đo điện trở một chiều, đóng cắt có thể để lại từ dư làm cộng hưởng lõi dịch (IEEE
          C57.149 6.5.9); Bảng 10 khuyên ít dựa vào sự dịch ở vùng này vì có thể bị từ dư che khuất. Khử từ rồi đo lại nếu nghi ngờ tình trạng lõi.
        </p>
      )}

      {!it.skipped && <h3>Dạng hư hỏng phù hợp</h3>}
      {!it.skipped && shown.length === 0 && (
        <p>Không có dạng hư hỏng nào trong IEEE C57.149 6.5 khớp với các thay đổi này. Kiểm tra lại cấu hình đo và đối chiếu bằng các phép đo khác.</p>
      )}
      {nothing && <p>Không vùng nào thay đổi vượt ngưỡng: phù hợp với không có thay đổi đáng kể.</p>}
      <ol className="candidates">
        {shown
          .filter((c) => c.fault.id !== "none")
          .map((c) => (
            <li key={c.fault.id} className="candidate">
              <div className="row between wrap">
                <h4>{c.fault.label}</h4>
                <span className="muted small">
                  Khớp {Math.round(((c.score + 1) / 2) * 100)} % các điểm kiểm tra
                </span>
              </div>
              <p className="muted">{c.fault.summary}</p>
              <ul className="reasons">
                {c.agree.map((a) => (
                  <li key={a} className="agree">
                    {a}
                  </li>
                ))}
                {c.disagree.map((a) => (
                  <li key={a} className="disagree">
                    {a}
                  </li>
                ))}
              </ul>
              {c.fault.suggest && c.fault.suggest.length > 0 && (
                <p>
                  Khuyến nghị:{" "}
                  {c.fault.suggest
                    .map(recLabel)
                    .filter(Boolean)
                    .map((x) => `${x!.label} (${x!.source})`)
                    .join("; ")}
                  .
                </p>
              )}
              <p className="src">Nguồn: {c.fault.source}</p>
            </li>
          ))}
      </ol>
      <p className="muted small">
        Phép đo giữa các cuộn dây (nhóm Xuyên cuộn) không đối chiếu; phép đo khác được xét là hở mạch, trừ khi file ghi có cuộn dây nối tắt. Không đối chiếu được dạng không có trong IEEE C57.149 6.5. Cùng một dạng
        hư hỏng ảnh hưởng khác nhau tùy kiểu và thiết kế máy; dải tần trong các bảng chỉ là gần đúng (IEEE C57.149 6.5).
      </p>
    </div>
  );
}
