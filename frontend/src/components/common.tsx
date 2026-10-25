import type { Classification } from "../core/dlt911";
import type { QualityWarning } from "../core/quality";

export function LevelBadge({ c }: { c: Classification | null }) {
  if (!c) return <span className="badge lv-none">–</span>;
  return (
    <span className={`badge lv-${c.id}`} title={`${c.label_en} — ${c.source}`}>
      {c.label}
    </span>
  );
}

export function Warnings({ items, compact = false }: { items: QualityWarning[]; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className={compact ? "warns compact" : "warns"}>
      {items.map((w, i) => (
        <li key={i} className={w.severity} title={`Căn cứ: ${w.source}`}>
          {w.message}
          {!compact && <span className="src"> — {w.source}</span>}
        </li>
      ))}
    </ul>
  );
}

export function InternalTag({ label = "Ngưỡng nội bộ (cấu hình được)" }: { label?: string }) {
  return <span className="tag-internal">{label}</span>;
}
