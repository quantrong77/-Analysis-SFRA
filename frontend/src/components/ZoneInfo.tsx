import { fmtHz, fmtHzShort } from "../core/quality";
import type { Standards } from "../core/standards";

interface Zone {
  label: string;
  f_min: number;
  f_max: number;
  influence?: string;
}

/**
 * What influences the response at the frequency under the mouse, per IEC 60076-18 Annex B.3.
 * The card keeps the last zone pointed at, so the text can be read after the mouse leaves.
 */
export default function ZoneInfo({ std, freq }: { std: Standards; freq: number | null }) {
  const iec = std.iec_zones ?? {};
  const zones = Object.values((iec.zones ?? {}) as Record<string, Zone>);
  const zone = freq === null ? undefined : zones.find((z, i) => freq >= z.f_min && (freq < z.f_max || i === zones.length - 1));
  if (!zones.some((z) => z.influence)) return null;
  const range = (z: Zone) =>
    z.f_min <= 0 ? `dưới ${fmtHzShort(z.f_max)}` : Number.isFinite(z.f_max) ? `${fmtHzShort(z.f_min)} – ${fmtHzShort(z.f_max)}` : `trên ${fmtHzShort(z.f_min)}`;
  return (
    <div className="zone-info" aria-live="polite">
      {zone && freq !== null ? (
        <>
          <p className="zone-info-head">
            <strong>{zone.label}</strong> <span className="muted">({range(zone)}), đang trỏ {fmtHz(freq)}</span>
          </p>
          <p>{zone.influence}</p>
          <p className="muted small">
            Căn cứ: {iec.influence_source ?? iec.source}. {iec.influence_note}.
          </p>
        </>
      ) : (
        <p className="muted">Trỏ chuột lên giản đồ để xem ảnh hưởng của vùng tần số đó theo IEC 60076-18.</p>
      )}
    </div>
  );
}
