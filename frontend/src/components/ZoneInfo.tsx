import { useEffect, useRef } from "react";
import { fmtHz, fmtHzShort } from "../core/quality";
import type { Standards } from "../core/standards";

interface Zone {
  label: string;
  f_min: number;
  f_max: number;
  influence?: string;
}

/**
 * What influences the response in each frequency zone, per IEC 60076-18 Annex B.3. Every zone is
 * listed; the zone under the mouse is highlighted and scrolled into view, and stays highlighted
 * after the mouse leaves so the text can be read.
 */
export default function ZoneInfo({ std, freq }: { std: Standards; freq: number | null }) {
  const iec = std.iec_zones ?? {};
  const zones = Object.values((iec.zones ?? {}) as Record<string, Zone>);
  const at = freq === null ? -1 : zones.findIndex((z, i) => freq >= z.f_min && (freq < z.f_max || i === zones.length - 1));
  const box = useRef<HTMLDivElement>(null);

  // scroll inside the card only: the page itself must not move while the mouse is over the plot
  useEffect(() => {
    const el = box.current;
    const item = el?.querySelector<HTMLElement>(`[data-zone="${at}"]`);
    if (!el || !item) return;
    // the sticky title covers the top of the card: keep the zone below it
    const head = el.querySelector<HTMLElement>(".zone-info-title")?.offsetHeight ?? 0;
    const top = item.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    const shown = top >= el.scrollTop + head && top + item.offsetHeight <= el.scrollTop + el.clientHeight;
    if (!shown) el.scrollTo({ top: top - head - 6, behavior: "smooth" });
  }, [at]);

  if (!zones.some((z) => z.influence)) return null;
  const range = (z: Zone) =>
    z.f_min <= 0 ? `dưới ${fmtHzShort(z.f_max)}` : Number.isFinite(z.f_max) ? `${fmtHzShort(z.f_min)} – ${fmtHzShort(z.f_max)}` : `trên ${fmtHzShort(z.f_min)}`;
  return (
    <div className="zone-info" ref={box} aria-live="polite">
      <div className="zone-info-title">
        <h3>Ảnh hưởng theo vùng tần số</h3>
        <span className="muted small">
          {at >= 0 && freq !== null ? `Đang trỏ ${fmtHz(freq)}` : "Trỏ chuột lên giản đồ để tô sáng vùng tương ứng"}
        </span>
      </div>
      <ol className="zone-list">
        {zones.map((z, i) => (
          <li key={z.label} data-zone={i} className={i === at ? "on" : ""} aria-current={i === at ? "true" : undefined}>
            <p className="zone-info-head">
              <strong>{z.label}</strong> <span className="muted">{range(z)}</span>
            </p>
            <p>{z.influence}</p>
          </li>
        ))}
      </ol>
      <p className="muted small">
        Căn cứ: {iec.influence_source ?? iec.source}. {iec.influence_note}.
      </p>
    </div>
  );
}
