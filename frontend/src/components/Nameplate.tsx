import type { Classification } from "../core/dlt911";
import type { TransformerGroup } from "../core/pairing";
import type { GridMode } from "../core/resample";
import { MODE_OPTIONS } from "../views/ResultsView";
import { sessionLabel } from "../workspace";

interface Props {
  group: TransformerGroup;
  name: string;
  manufacturer: string;
  year: string;
  worst: Classification | null;
  mode: GridMode;
  onMode: (m: GridMode) => void;
  onSessions: (baseline: string, test: string) => void;
}

/**
 * Context header of every transformer view, styled after a transformer rating plate:
 * identity, the two sessions compared, the grid mode and the overall verdict.
 */
export default function Nameplate({ group, name, manufacturer, year, worst, mode, onMode, onSessions }: Props) {
  const single = group.sessions.length < 2;
  return (
    <section className="plate" aria-label="Máy biến áp đang xem">
      <div className="plate-cell plate-name">
        <span className="plate-k">Máy biến áp</span>
        <span className="plate-v plate-big">{name || group.key}</span>
      </div>
      <div className="plate-cell">
        <span className="plate-k">Số chế tạo</span>
        <span className="plate-v">{group.serialNumber || group.key}</span>
      </div>
      <div className="plate-cell">
        <span className="plate-k">Vị trí</span>
        <span className="plate-v">{group.locations.join(", ") || "Chưa ghi"}</span>
      </div>
      <div className="plate-cell">
        <span className="plate-k">Hãng, năm sản xuất</span>
        <span className="plate-v">{[manufacturer, year].filter(Boolean).join(", ") || "Chưa ghi"}</span>
      </div>
      <label className="plate-cell">
        <span className="plate-k">Baseline</span>
        <select className="plate-select" value={group.baselineSession} onChange={(e) => onSessions(e.target.value, group.testSession)}>
          {group.sessions.map((s) => (
            <option key={s} value={s}>
              {sessionLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="plate-cell">
        <span className="plate-k">Lần đo</span>
        <select className="plate-select" value={group.testSession} disabled={single} onChange={(e) => onSessions(group.baselineSession, e.target.value)}>
          {group.sessions.map((s) => (
            <option key={s} value={s}>
              {sessionLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="plate-cell">
        <span className="plate-k">Căn lưới tần số</span>
        <select className="plate-select" value={mode} onChange={(e) => onMode(e.target.value as GridMode)}>
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className={`plate-cell plate-verdict v-${worst?.id ?? "none"}`}>
        <span className="plate-k">Đánh giá chung</span>
        <span className="plate-v">{worst ? worst.label : single ? "Một kỳ đo, chưa so sánh" : "Chưa có cặp"}</span>
      </div>
    </section>
  );
}
