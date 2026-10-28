/**
 * Transfer-function lab: one sine frequency at a time through the winding model, V_in and V_out drawn
 * as moving waves and as phasors, with the amplitude and phase plots marking where that frequency sits.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { fmtHz, fmtHzShort } from "../../core/quality";
import { TRAINING } from "../../core/training/content";
import { fromU, LAB_F0, LAB_F1, phaseText, readAt, rlCorner, sweep, toU, turningPoints, type LabCircuit, type Reading, type Sweep } from "../../core/training/tf";
import { Source } from "./shared";

const CIRCUITS: { id: LabCircuit; label: string; note: string }[] = [
  {
    id: "rl",
    label: "Mạch R–L đơn giản",
    note: "Một cuộn cảm 10 mH và điện trở 5 Ω nối tiếp với trở kháng đo 50 Ω. Chỉ có một phần tử tích trữ năng lượng nên đáp ứng không có cộng hưởng: dễ thấy biên độ và pha thay đổi thế nào trước khi xem cuộn dây thật.",
  },
  {
    id: "open",
    label: "Cuộn dây – hở mạch",
    note: "Mô hình hình thang của bài Giả lập hư hỏng, đo đầu – cuối với các đầu khác để hở: vùng thấp có điện cảm từ hóa của lõi.",
  },
  {
    id: "short",
    label: "Cuộn dây – ngắn mạch",
    note: "Cùng mô hình, cuộn dây kia nối tắt: lõi không còn tham gia, vùng thấp là điện cảm tản của cuộn dây.",
  },
];

const SWEEP_SECONDS = 24;
/** a single inductance or capacitance gives about ±20 dB per decade (IEEE C57.149 Annex A); much steeper is the flank of a resonance */
const STEEP = 30;
const WAVE_SECONDS = 1.6;

/** Numbers as written in Vietnamese: decimal comma, typographic minus */
const vn = (t: string) => t.replace("-", "−").replace(".", ",");
const num = (x: number, digits = 1) => vn(x.toFixed(digits));
const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const fmtTime = (s: number) => {
  const a = Math.abs(s);
  if (a >= 1e-3) return `${vn((s * 1e3).toPrecision(3))} ms`;
  if (a >= 1e-6) return `${vn((s * 1e6).toPrecision(3))} µs`;
  return `${vn((s * 1e9).toPrecision(3))} ns`;
};
const fmtRatio = (x: number) => {
  if (x >= 0.1) return num(x, 3);
  if (x >= 1e-4) return vn(x.toPrecision(3));
  const [m, e] = x.toExponential(2).split("e");
  return `${vn(m)} × 10${[...String(Number(e))].map((ch) => SUP[ch]).join("")}`;
};
const deg = (x: number) => `${x > 0 ? "+" : ""}${num(x)}°`;
/** Enlargement factor of the drawn V_out: whole numbers with thousands grouped */
const fmtGain = (g: number) => (g < 10 ? num(g, 2) : Math.round(g).toLocaleString("vi-VN"));

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

const STORE = "sfra.lab";
interface Saved {
  circuit: LabCircuit;
  u: number;
  trueScale: boolean;
}
function loadSaved(): Saved {
  const fallback: Saved = { circuit: "rl", u: toU(1000), trueScale: false };
  try {
    const x = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as Partial<Saved> | null;
    if (!x) return fallback;
    return {
      circuit: CIRCUITS.some((c) => c.id === x.circuit) ? x.circuit! : fallback.circuit,
      u: typeof x.u === "number" && x.u >= 0 && x.u <= 1 ? x.u : fallback.u,
      trueScale: x.trueScale === true,
    };
  } catch {
    return fallback;
  }
}

export default function TransferLab() {
  const [saved] = useState(loadSaved);
  const [circuit, setCircuit] = useState<LabCircuit>(saved.circuit);
  const [u, setU] = useState(saved.u);
  const [playing, setPlaying] = useState(false);
  const [trueScale, setTrueScale] = useState(saved.trueScale);
  const [theta, setTheta] = useState(0);
  const reduced = useReducedMotion();
  const s = useMemo(() => sweep(circuit), [circuit]);
  const turns = useMemo(() => turningPoints(s), [s]);
  const f = fromU(u);
  const r = readAt(s, f);
  const info = CIRCUITS.find((c) => c.id === circuit)!;

  // waves move continuously; the sweep moves the frequency along the axis while playing
  const playRef = useRef(playing);
  playRef.current = playing;
  useEffect(() => {
    if (reduced && !playing) return;
    let last = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!reduced) setTheta((t) => (t + dt / WAVE_SECONDS) % 1);
      if (playRef.current) {
        setU((x) => {
          const next = x + dt / SWEEP_SECONDS;
          if (next >= 1) {
            setPlaying(false);
            return 1;
          }
          return next;
        });
      }
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [reduced, playing]);

  // remembered once the sweep is not moving it, not on every animation frame
  useEffect(() => {
    if (playing) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ circuit, u, trueScale }));
    } catch {
      /* storage unavailable: the lab starts from the defaults next time */
    }
  }, [circuit, u, trueScale, playing]);

  const jump = (dir: 1 | -1) => {
    const list = dir > 0 ? turns.filter((t) => t.f > r.f * 1.01) : turns.filter((t) => t.f < r.f / 1.01).reverse();
    if (list.length) {
      setPlaying(false);
      setU(toU(list[0].f));
    }
  };

  const bands = TRAINING.bands.filter((b) => r.f >= b.f_min && r.f <= b.f_max).map((b) => b.label);
  const gain = trueScale ? 1 : 1 / r.ratio;

  return (
    <div className="training-tab lab">
      <section className="theory-section">
        <h2>Từ Vin, qua hàm truyền, tới Vout</h2>
        <p>
          Máy SFRA đặt một điện áp hình sin Vin vào một đầu cuộn dây và đo điện áp Vout ở đầu kia trên trở kháng 50 Ω, lần lượt ở từng tần số. Với mạch
          tuyến tính, Vout vẫn là hình sin cùng tần số, chỉ khác hai điều: <strong>biên độ</strong> nhỏ đi (hay lớn lên) theo tỉ số |Vout/Vin|, và sóng bị{" "}
          <strong>lệch pha</strong> một góc φ. Hai con số đó ở mọi tần số chính là hàm truyền H(f) = Vout/Vin, và chính là hai đồ thị biên độ, pha mà app vẽ.
        </p>
        <Source>IEC 60076-18:2012, 4.1</Source>
      </section>

      <div className="sim-controls lab-controls">
        <div className="field">
          <span>Mạch</span>
          <div
            className="seg"
            role="radiogroup"
            aria-label="Mạch"
            onKeyDown={(e) => {
              const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const k = (CIRCUITS.findIndex((c) => c.id === circuit) + step + CIRCUITS.length) % CIRCUITS.length;
              setCircuit(CIRCUITS[k].id);
              (e.currentTarget.children[k] as HTMLElement).focus();
            }}
          >
            {CIRCUITS.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={circuit === c.id}
                tabIndex={circuit === c.id ? 0 : -1}
                className={circuit === c.id ? "on" : ""}
                onClick={() => setCircuit(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field lab-freq">
          <span>
            Tần số: <strong>{fmtHz(r.f)}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(u * 1000)}
            aria-valuetext={fmtHz(r.f)}
            onChange={(e) => {
              setPlaying(false);
              setU(Number(e.target.value) / 1000);
            }}
          />
          <span className="lab-scale muted small">
            <span>{fmtHzShort(LAB_F0)}</span>
            <span>{fmtHzShort(LAB_F1)}</span>
          </span>
        </label>
        <div className="field">
          <span>Quét tần số</span>
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                if (!playing && u >= 1) setU(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "Tạm dừng" : u >= 1 ? "Quét lại" : "Quét"}
            </button>
            <button onClick={() => jump(-1)} disabled={!turns.some((t) => t.f < r.f / 1.01)} title="Đỉnh hoặc hố gần nhất phía tần số thấp">
              ◀ Cộng hưởng
            </button>
            <button onClick={() => jump(1)} disabled={!turns.some((t) => t.f > r.f * 1.01)} title="Đỉnh hoặc hố gần nhất phía tần số cao">
              Cộng hưởng ▶
            </button>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={trueScale} onChange={(e) => setTrueScale(e.target.checked)} />
          Vẽ Vout đúng tỉ lệ với Vin
        </label>
      </div>
      <p className="muted small">{info.note}</p>

      <ChainDiagram r={r} />

      <div className="lab-scope">
        <figure className="lab-panel">
          <figcaption>
            Dạng sóng trong hai chu kỳ
            <span className="muted small">
              {trueScale ? "Vout đúng tỉ lệ" : `Vout phóng to × ${fmtGain(gain)} để cùng cỡ Vin`}
            </span>
          </figcaption>
          <Scope r={r} gain={gain} theta={theta} />
        </figure>
        <figure className="lab-panel">
          <figcaption>Véc-tơ pha (Vin làm chuẩn 0°)</figcaption>
          <Phasor r={r} gain={gain} />
        </figure>
      </div>

      <dl className="lab-readout">
        <div>
          <dt>Tần số</dt>
          <dd>{fmtHz(r.f)}</dd>
        </div>
        <div>
          <dt>|Vout / Vin|</dt>
          <dd>{fmtRatio(r.ratio)}</dd>
        </div>
        <div>
          <dt>Biên độ</dt>
          <dd>{num(r.magDb)} dB</dd>
        </div>
        <div>
          <dt>Góc pha φ</dt>
          <dd>{deg(r.phaseDeg)}</dd>
        </div>
        <div>
          <dt>{r.delay >= 0 ? "Vout trễ" : "Vout sớm"}</dt>
          <dd>{fmtTime(Math.abs(r.delay))}</dd>
        </div>
        <div>
          <dt>Vùng IEEE C57.149</dt>
          <dd className="small">{bands.length ? bands.join("; ") : "–"}</dd>
        </div>
      </dl>

      <div className="lab-bode">
        <figure className="lab-panel">
          <figcaption>Đáp ứng biên độ 20·log10|H| (dB). Bấm hoặc kéo trên đồ thị để chọn tần số</figcaption>
          <Bode s={s} r={r} kind="mag" onPick={(x) => (setPlaying(false), setU(toU(x)))} />
        </figure>
        <figure className="lab-panel">
          <figcaption>Đáp ứng pha arg H (độ)</figcaption>
          <Bode s={s} r={r} kind="phase" onPick={(x) => (setPlaying(false), setU(toU(x)))} />
        </figure>
      </div>

      <div className="lab-explain">
        <AmplitudeNote r={r} circuit={circuit} />
        <PhaseNote r={r} />
      </div>
    </div>
  );
}

/** V_in source, the winding as a box H(f), the 50 Ω response impedance, V_out: with the current values */
function ChainDiagram({ r }: { r: Reading }) {
  // the small output sine: height on a log scale so a −60 dB signal still shows, shifted by φ
  const h = Math.max(3, 18 * (1 + Math.max(-60, Math.min(0, r.magDb)) / 60));
  const glyph = (x: number, y: number, amp: number, shift: number) => {
    let d = "";
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      d += `${i ? "L" : "M"}${(x + t * 60).toFixed(1)} ${(y - amp * Math.sin(2 * Math.PI * (2 * t) + shift)).toFixed(1)}`;
    }
    return d;
  };
  const phi = (r.phaseDeg * Math.PI) / 180;
  return (
    <svg
      className="diagram lab-chain"
      viewBox="0 0 720 170"
      role="img"
      aria-label={`Vin qua hàm truyền H của cuộn dây tới Vout trên 50 Ω: biên độ ${num(r.magDb)} dB, pha ${num(r.phaseDeg)} độ`}
    >
      <g className="dg-wire">
        <path d="M70 70 H190 M530 70 H600 M600 70 V96 M600 134 V150 H70 V102" />
        <path d={glyph(100, 34, 18, 0)} className="lab-vin" />
        <path d={glyph(606, 34, h, phi)} className="lab-vout" />
        <path d="M600 96 l-7 4 l14 6 l-14 6 l14 6 l-14 6 l7 4 v6" />
      </g>
      <circle cx="70" cy="86" r="16" className="lab-src" />
      <path d="M60 86 q5 -10 10 0 q5 10 10 0" className="lab-src-wave" />
      <text x="40" y="91" className="dg-label strong" textAnchor="end">
        Vin
      </text>
      <rect x="190" y="30" width="340" height="80" rx="4" className="lab-box" />
      <text x="360" y="58" className="dg-label strong" textAnchor="middle">
        Cuộn dây: mạng R, L, C
      </text>
      <text x="360" y="82" className="dg-label" textAnchor="middle">
        H(f) = Vout / Vin
      </text>
      <text x="360" y="102" className="dg-label small" textAnchor="middle">
        {fmtHz(r.f)}: {num(r.magDb)} dB, φ = {deg(r.phaseDeg)}
      </text>
      <text x="618" y="122" className="dg-label">
        50 Ω
      </text>
      <text x="714" y="78" className="dg-label strong lab-vout-text" textAnchor="end">
        Vout
      </text>
      <text x="84" y="136" className="dg-label muted">
        biên độ 1 (chuẩn)
      </text>
    </svg>
  );
}

const SW = 640;
const SH = 240;
const SM = { l: 44, r: 14, t: 22, b: 30 };

/** V_in and V_out over two periods, moving; the delay between their crests marked */
function Scope({ r, gain, theta }: { r: Reading; gain: number; theta: number }) {
  const w = SW - SM.l - SM.r;
  const h = SH - SM.t - SM.b;
  const y0 = SM.t + h / 2;
  const A = h / 2 - 12;
  const X = (p: number) => SM.l + (p / 2) * w;
  // delay of V_out in periods, within half a period either way
  const shift = -(((((r.phaseDeg + 180) % 360) + 360) % 360) - 180) / 360;
  const amp = Math.min(1.1, r.ratio * gain);
  const path = (a: number, lag: number) => {
    let d = "";
    for (let i = 0; i <= 240; i++) {
      const p = (i / 240) * 2;
      d += `${i ? "L" : "M"}${X(p).toFixed(1)} ${(y0 - A * a * Math.sin(2 * Math.PI * (p - theta - lag))).toFixed(1)}`;
    }
    return d;
  };
  // a crest of V_in in the middle of the window, and the V_out crest that follows from it
  let p = (theta + 0.25) % 1;
  while (p < 0.5) p += 1;
  const q = p + shift;
  const T = 1 / r.f;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${SW} ${SH}`} role="img" aria-label={`Vin và Vout ở ${fmtHz(r.f)}: Vout lệch ${num(r.phaseDeg)} độ`}>
      {[0, 0.5, 1, 1.5, 2].map((x) => (
        <g key={x}>
          <line x1={X(x)} x2={X(x)} y1={SM.t} y2={SM.t + h} className="lab-grid" />
          <text x={X(x)} y={SH - 10} textAnchor={x === 0 ? "start" : x === 2 ? "end" : "middle"} className="lab-tick">
            {x === 0 ? "0" : fmtTime(x * T)}
          </text>
        </g>
      ))}
      <line x1={SM.l} x2={SM.l + w} y1={y0} y2={y0} className="lab-axis" />
      <text x={SM.l - 6} y={y0 - A + 4} textAnchor="end" className="lab-tick">
        +1
      </text>
      <text x={SM.l - 6} y={y0 + A + 4} textAnchor="end" className="lab-tick">
        −1
      </text>
      <path d={path(1, 0)} className="lab-vin" />
      <path d={path(amp, shift)} className="lab-vout" />
      {Math.abs(shift) > 0.01 && (
        <g className="lab-delay">
          <line x1={X(p)} x2={X(p)} y1={y0 - A} y2={SM.t - 6} />
          <line x1={X(q)} x2={X(q)} y1={y0 - A * amp} y2={SM.t - 6} />
          <line x1={X(p)} x2={X(q)} y1={SM.t - 2} y2={SM.t - 2} markerEnd="url(#lab-arrow)" />
          <defs>
            <marker id="lab-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" />
            </marker>
          </defs>
        </g>
      )}
      <circle cx={X(p)} cy={y0 - A} r="4" className="lab-dot-in" />
      <circle cx={X(q)} cy={y0 - A * amp} r="4" className="lab-dot-out" />
      <g className="lab-legend">
        <line x1={SW - 170} x2={SW - 150} y1={12} y2={12} className="lab-vin" />
        <text x={SW - 145} y={16}>
          Vin
        </text>
        <line x1={SW - 100} x2={SW - 80} y1={12} y2={12} className="lab-vout" />
        <text x={SW - 75} y={16}>
          Vout
        </text>
      </g>
    </svg>
  );
}

/** V_in along 0°, V_out at φ with its length to scale (or enlarged like the waves) */
function Phasor({ r, gain }: { r: Reading; gain: number }) {
  const c = 120;
  const R = 92;
  const len = Math.max(6, R * Math.min(1.1, r.ratio * gain));
  const a = (r.phaseDeg * Math.PI) / 180;
  const ox = c + len * Math.cos(a);
  const oy = c - len * Math.sin(a);
  const ar = 34;
  const large = Math.abs(r.phaseDeg) > 180 ? 1 : 0;
  const sweepFlag = r.phaseDeg < 0 ? 1 : 0;
  const ax = c + ar * Math.cos(a);
  const ay = c - ar * Math.sin(a);
  const mid = a / 2;
  return (
    <svg className="lab-svg phasor" viewBox="0 0 240 240" role="img" aria-label={`Véc-tơ Vout lệch ${num(r.phaseDeg)} độ so với Vin`}>
      <circle cx={c} cy={c} r={R} className="lab-grid" fill="none" />
      <line x1={c - R - 8} x2={c + R + 8} y1={c} y2={c} className="lab-axis" />
      <line x1={c} x2={c} y1={c - R - 8} y2={c + R + 8} className="lab-axis" />
      <text x={c + R + 4} y={c - 6} className="lab-tick">
        0°
      </text>
      <text x={c + 4} y={c - R - 2} className="lab-tick">
        +90° sớm
      </text>
      <text x={c + 4} y={c + R + 14} className="lab-tick">
        −90° trễ
      </text>
      {Math.abs(r.phaseDeg) > 1 && <path d={`M${c + ar} ${c} A${ar} ${ar} 0 ${large} ${sweepFlag} ${ax} ${ay}`} className="lab-arc" />}
      <line x1={c} y1={c} x2={c + R} y2={c} className="lab-vin vec" markerEnd="url(#ph-in)" />
      <line x1={c} y1={c} x2={ox} y2={oy} className="lab-vout vec" markerEnd="url(#ph-out)" />
      <text x={c + (ar + 14) * Math.cos(mid)} y={c - (ar + 14) * Math.sin(mid) + 4} className="lab-tick strong" textAnchor="middle">
        φ
      </text>
      <defs>
        <marker id="ph-in" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" className="lab-head-in" />
        </marker>
        <marker id="ph-out" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" className="lab-head-out" />
        </marker>
      </defs>
    </svg>
  );
}

const BW = 640;
const BH = 210;
const BM = { l: 52, r: 14, t: 14, b: 30 };
const DECADES = [100, 1e3, 1e4, 1e5, 1e6];

/** Amplitude or phase over the sweep, with the current frequency marked; click or drag to pick */
function Bode({ s, r, kind, onPick }: { s: Sweep; r: Reading; kind: "mag" | "phase"; onPick: (f: number) => void }) {
  const ys = kind === "mag" ? s.magDb : s.phaseDeg;
  const [lo, hi] = useMemo(() => {
    if (kind === "phase") return ys.every((y) => y >= -90 && y <= 90) ? [-90, 90] : [-180, 180];
    return [Math.floor(Math.min(...ys) / 10) * 10, Math.ceil(Math.max(...ys) / 10) * 10];
  }, [ys, kind]);
  const w = BW - BM.l - BM.r;
  const h = BH - BM.t - BM.b;
  const X = (f: number) => BM.l + toU(f) * w;
  const Y = (y: number) => BM.t + ((hi - y) / (hi - lo)) * h;
  const d = ys.map((y, i) => `${i ? "L" : "M"}${X(s.freq[i]).toFixed(1)} ${Y(y).toFixed(1)}`).join("");
  const step = kind === "phase" ? (hi - lo) / 4 : hi - lo > 80 ? 20 : 10;
  const ticks: number[] = [];
  for (let y = lo; y <= hi + 1e-9; y += step) ticks.push(y);
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * BW;
    onPick(fromU((x - BM.l) / w));
  };
  const v = kind === "mag" ? r.magDb : r.phaseDeg;
  const cx = X(r.f);
  return (
    <svg
      className="lab-svg bode"
      viewBox={`0 0 ${BW} ${BH}`}
      role="img"
      aria-label={kind === "mag" ? "Đồ thị biên độ theo tần số" : "Đồ thị pha theo tần số"}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
      }}
    >
      {ticks.map((y) => (
        <g key={y}>
          <line x1={BM.l} x2={BM.l + w} y1={Y(y)} y2={Y(y)} className={y === 0 ? "lab-axis" : "lab-grid"} />
          <text x={BM.l - 6} y={Y(y) + 4} textAnchor="end" className="lab-tick">
            {kind === "phase" ? `${num(y, 0)}°` : num(y, 0)}
          </text>
        </g>
      ))}
      {DECADES.map((f) => (
        <g key={f}>
          <line x1={X(f)} x2={X(f)} y1={BM.t} y2={BM.t + h} className="lab-grid" />
          <text x={X(f)} y={BH - 10} textAnchor="middle" className="lab-tick">
            {fmtHzShort(f)}
          </text>
        </g>
      ))}
      <path d={d} className={kind === "mag" ? "lab-curve" : "lab-curve phase"} />
      <line x1={cx} x2={cx} y1={BM.t} y2={BM.t + h} className="lab-cursor" />
      <circle cx={cx} cy={Y(v)} r="5" className="lab-dot-out" />
      <text x={cx + (cx > BW - 140 ? -8 : 8)} y={Math.max(BM.t + 12, Y(v) - 8)} textAnchor={cx > BW - 140 ? "end" : "start"} className="lab-tick strong">
        {kind === "mag" ? `${num(v)} dB` : deg(v)}
      </text>
    </svg>
  );
}

function AmplitudeNote({ r, circuit }: { r: Reading; circuit: LabCircuit }) {
  const slope = r.slope;
  return (
    <section className="lab-note amp">
      <h3>Đọc đáp ứng biên độ</h3>
      <p>
        Ở {fmtHz(r.f)}, Vout bằng <strong>{fmtRatio(r.ratio)}</strong> lần Vin. Đổi sang dB: 20 × log10({fmtRatio(r.ratio)}) ={" "}
        <strong>{num(r.magDb)} dB</strong>. Cứ −20 dB là Vout nhỏ đi 10 lần, −40 dB là 100 lần, 0 dB là bằng Vin.
      </p>
      <Source>IEC 60076-18:2012, 4.1, ghi chú 2</Source>
      <p>
        Quanh tần số này đường biên độ{" "}
        {r.extremum ? (
          <>
            đang đi qua một {r.extremum.kind === "min" ? "hố" : "đỉnh"} cộng hưởng nên độ dốc đổi dấu rất nhanh; đọc độ dốc ở hai bên, cách xa đỉnh, hố,
            để biết đoạn đó mang tính cảm (khoảng −20 dB mỗi decade) hay tính dung (khoảng +20 dB mỗi decade).
          </>
        ) : Math.abs(slope) > STEEP ? (
          <>
            đang ở <strong>sườn của một cộng hưởng</strong>, dốc {num(slope, 0)} dB mỗi decade: dốc hơn nhiều so với khoảng ±20 dB mỗi decade của một
            phần tử điện cảm hay điện dung đơn lẻ, nên ở đây không suy ra được tính cảm hay tính dung. Dùng nút Cộng hưởng để tới đỉnh, hố gần nhất.
          </>
        ) : slope <= -12 ? (
          <>
            đang <strong>giảm khoảng {num(Math.abs(slope), 0)} dB mỗi decade</strong>: dấu hiệu điện cảm chiếm ưu thế (tần số tăng 10 lần thì trở kháng
            cảm tăng 10 lần, Vout giảm 10 lần).
          </>
        ) : slope >= 12 ? (
          <>
            đang <strong>tăng khoảng {num(slope, 0)} dB mỗi decade</strong>: dấu hiệu điện dung chiếm ưu thế (trở kháng dung giảm khi tần số tăng).
          </>
        ) : (
          <>
            <strong>khá phẳng</strong> ({slope >= 0 ? "+" : ""}
            {num(slope, 0)} dB mỗi decade): trở kháng gần như không đổi theo tần số.
          </>
        )}
      </p>
      <Source>IEEE Std C57.149-2012, Phụ lục A</Source>
      {r.extremum && (
        <p>
          Gần {fmtHz(r.extremum.f)} có một <strong>{r.extremum.kind === "min" ? "hố (cực tiểu)" : "đỉnh (cực đại)"}</strong> sâu {num(r.extremum.depth)}{" "}
          dB.{" "}
          {r.extremum.kind === "min"
            ? "Theo mạch tương đương, hố là phản cộng hưởng song song của điện cảm cuộn dây với điện dung nối tiếp Cs: mạch chặn tín hiệu ở tần số đó."
            : "Theo mạch tương đương, đỉnh là cộng hưởng nối tiếp của điện cảm với điện dung đất Cg: mạch khuếch đại tín hiệu ở tần số đó."}{" "}
          Khi cuộn dây biến dạng, L và C thay đổi nên chính các đỉnh, hố này dịch tần số.
        </p>
      )}
      {r.extremum && <Source>IEEE Std C57.149-2012, Phụ lục A, Hình A.3; 6.2</Source>}
      {circuit === "rl" && (
        <p className="muted small">
          Mạch R–L có tần số góc (R + 50 Ω) / (2πL) ≈ {fmtHz(rlCorner())}: thấp hơn thì Vout gần bằng 50/55 Vin, cao hơn thì giảm 20 dB mỗi decade.
        </p>
      )}
    </section>
  );
}

function PhaseNote({ r }: { r: Reading }) {
  const t = phaseText(r.phaseDeg);
  const T = 1 / r.f;
  return (
    <section className={`lab-note phase ${t.tone}`}>
      <h3>Đọc đáp ứng pha</h3>
      <p>
        Góc pha φ = <strong>{deg(r.phaseDeg)}</strong>. Một chu kỳ ở {fmtHz(r.f)} dài {fmtTime(T)}, nên đỉnh sóng Vout{" "}
        {r.delay >= 0 ? "đến sau" : "đến trước"} đỉnh Vin <strong>{fmtTime(Math.abs(r.delay))}</strong> (= |φ| / 360° × chu kỳ). Trên đồ thị dạng sóng là
        mũi tên giữa hai chấm.
      </p>
      <Source>IEC 60076-18:2012, 4.1</Source>
      <p>{t.text}</p>
      <p className="muted small">
        Quy tắc trễ là cảm, sớm là dung đúng chính xác với mạch R–L; với mạng hình thang có cả điện dung đất nên chỉ là gần đúng. Pha cho biết cùng một
        thông tin về L, C như biên độ: IEEE C57.149 6.2 ghi chênh lệch biên độ đáng kể thường đi kèm chênh lệch pha đáng kể.
      </p>
      {r.phaseSwing >= 30 && (
        <p>
          Trong ±0,1 decade quanh đây pha đổi <strong>{num(r.phaseSwing, 0)}°</strong>: pha đổi nhanh và đổi chiều quanh một cộng hưởng, từ tính cảm sang
          tính dung hoặc ngược lại.
        </p>
      )}
      <Source>IEEE Std C57.149-2012, 6.2</Source>
    </section>
  );
}
