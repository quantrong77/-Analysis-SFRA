/** Teaching diagrams: winding ladder network and measurement connections. */
import type { Setup } from "../../core/training/content";

const coilV = (x: number, y0: number, y1: number, turns = 6) => {
  const h = (y1 - y0) / turns;
  let d = `M${x} ${y0}`;
  for (let i = 0; i < turns; i++) d += ` a ${h / 2} ${h / 2} 0 0 1 0 ${h}`;
  return d;
};
const coilH = (x0: number, x1: number, y: number, turns = 4) => {
  const w = (x1 - x0) / turns;
  let d = `M${x0} ${y}`;
  for (let i = 0; i < turns; i++) d += ` a ${w / 2} ${w / 2} 0 0 1 ${w} 0`;
  return d;
};
const ground = (x: number, y: number) => `M${x} ${y} v8 M${x - 9} ${y + 8} h18 M${x - 6} ${y + 12} h12 M${x - 3} ${y + 16} h6`;
const capV = (x: number, y0: number, y1: number) => {
  const m = (y0 + y1) / 2;
  return `M${x} ${y0} V${m - 3} M${x - 8} ${m - 3} h16 M${x - 8} ${m + 3} h16 M${x} ${m + 3} V${y1}`;
};
const capH = (x0: number, x1: number, y: number) => {
  const m = (x0 + x1) / 2;
  return `M${x0} ${y} H${m - 3} M${m - 3} ${y - 8} v16 M${m + 3} ${y - 8} v16 M${m + 3} ${y} H${x1}`;
};

/**
 * Ladder network of a winding (IEEE C57.149 Figure 18, Annex A): each section is L with its
 * resistance R, bridged by the series capacitance Cs, and Cg from each node to ground.
 */
export function LadderDiagram() {
  const xs = [90, 210, 330];
  const y = 110;
  return (
    <svg className="diagram" viewBox="0 0 560 230" role="img" aria-label="Mạng hình thang của cuộn dây: các đoạn L nối tiếp, Cs song song mỗi đoạn, Cg xuống đất ở mỗi nút">
      <g className="dg-wire">
        <path d={`M40 ${y} H${xs[0]}`} />
        {xs.map((x) => (
          <g key={x}>
            {/* R + L in series */}
            <path d={`M${x} ${y} h10 l4 -6 l6 12 l6 -12 l6 12 l4 -6 h6`} />
            <path d={coilH(x + 42, x + 98, y)} />
            <path d={`M${x + 98} ${y} H${x + 120}`} />
            {/* Cs bridging the section */}
            <path d={`M${x} ${y} V${y - 40} H${x + 50}`} />
            <path d={capH(x + 50, x + 70, y - 40)} />
            <path d={`M${x + 70} ${y - 40} H${x + 120} V${y}`} />
            {/* Cg to ground */}
            <path d={capV(x + 120, y, y + 50)} />
            <path d={ground(x + 120, y + 50)} />
          </g>
        ))}
        <path d={`M450 ${y} H500 V${y + 30}`} />
        <path d={`M492 ${y + 30} h16 v30 h-16 Z`} />
        <path d={ground(500, y + 60)} />
      </g>
      <g className="dg-label">
        <text x="26" y={y + 4} textAnchor="end">V_in</text>
        <text x="113" y={y - 12}>R</text>
        <text x="160" y={y - 12}>L</text>
        <text x="150" y={y - 52}>Cs</text>
        <text x="222" y={y + 30}>Cg</text>
        <text x="455" y={y - 8}>…</text>
        <text x="514" y={y + 50}>50 Ω</text>
        <text x="514" y={y + 4}>V_out</text>
        <text x="40" y="215">Một đoạn: R, L nối tiếp; Cs nối song song; Cg nối từ nút xuống đất (vỏ, lõi).</text>
      </g>
    </svg>
  );
}

const TERMINALS: Record<string, [number, number]> = { H1: [230, 60], H0: [230, 240], X1: [380, 60], X2: [380, 240] };

/**
 * One phase of a two-winding transformer: high-voltage winding H1–H0 and low-voltage winding X1–X2
 * on a core limb, with the instrument leads of the chosen measurement (IEC 60076-18 2.6–2.9).
 */
export function SetupDiagram({ setup }: { setup: Setup }) {
  const lead = (term: string, port: number, x: number, level: number) => {
    const [tx, ty] = TERMINALS[term];
    const top = ty < 150;
    const via = top ? level : 300 - level;
    return `M120 ${port} H${x} V${via} H${tx} V${ty}`;
  };
  const grounded = new Set(setup.grounded);
  const shorted = setup.shorted.length >= 2;
  return (
    <svg className="diagram" viewBox="0 0 520 300" role="img" aria-label={`Sơ đồ đấu dây: ${setup.label}`}>
      {/* core limb and windings */}
      <rect x="296" y="50" width="18" height="200" className="dg-core" />
      <g className="dg-wire">
        <path d={coilV(230, 60, 240, 7)} />
        <path d={coilV(380, 60, 240, 7)} />
      </g>
      <text className="dg-label small" x="270" y="155" textAnchor="middle">Cao áp</text>
      <text className="dg-label small" x="342" y="155" textAnchor="middle">Hạ áp</text>
      <text className="dg-label muted" x="305" y="270" textAnchor="middle">Lõi</text>

      {/* instrument */}
      <rect x="10" y="110" width="110" height="80" rx="4" className="dg-box" />
      <text className="dg-label" x="65" y="104" textAnchor="middle">Thiết bị đo</text>
      <text className="dg-label small" x="18" y="134">V_in</text>
      <text className="dg-label small" x="18" y="176">V_out 50 Ω</text>

      <path className="dg-lead vin" d={lead(setup.vin, 130, 140, 28)} />
      <path className="dg-lead vout" d={lead(setup.vout, 172, 156, 14)} />

      {shorted && <path className="dg-short" d={`M${TERMINALS.X1[0]} 60 H450 V240 H${TERMINALS.X2[0]}`} />}
      {shorted && <text className="dg-label" x="456" y="155">nối tắt</text>}

      {Object.entries(TERMINALS).map(([name, [x, y]]) => (
        <g key={name}>
          {grounded.has(name) && <path className="dg-wire" d={`M${x} ${y} H${x + 26} ${ground(x + 26, y)}`} />}
          <circle cx={x} cy={y} r="5" className={setup.vin === name || setup.vout === name || grounded.has(name) || (shorted && setup.shorted.includes(name)) ? "dg-term on" : "dg-term"} />
          <text className="dg-label strong" x={x - 10} y={y < 150 ? y - 10 : y + 22} textAnchor="end">
            {name}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * One signal seen two ways: in time, the sum of three sines (f, 3f, 5f with amplitudes 1, 1/3, 1/5);
 * in frequency, the same three components as bars of amplitude at their frequencies.
 */
export function TimeFreqDiagram() {
  const comps = [
    { k: 1, a: 1 },
    { k: 3, a: 1 / 3 },
    { k: 5, a: 1 / 5 },
  ];
  const x0 = 34;
  const w = 250;
  const y0 = 120;
  const A = 62;
  const wave = (fn: (p: number) => number) => {
    let d = "";
    for (let i = 0; i <= 200; i++) {
      const p = (i / 200) * 2;
      d += `${i ? "L" : "M"}${(x0 + (p / 2) * w).toFixed(1)} ${(y0 - A * fn(p)).toFixed(1)}`;
    }
    return d;
  };
  const sum = (p: number) => comps.reduce((s, c) => s + c.a * Math.sin(2 * Math.PI * c.k * p), 0);
  const fx = (k: number) => 384 + (k - 1) * 46;
  return (
    <svg
      className="diagram tf-diagram"
      viewBox="0 0 640 230"
      role="img"
      aria-label="Cùng một tín hiệu: bên trái theo thời gian là tổng ba sóng sin tần số f, 3f, 5f; bên phải theo tần số là ba vạch biên độ 1, 1/3, 1/5"
    >
      <text x={x0} y="22" className="dg-label strong">
        Miền thời gian: v(t)
      </text>
      <line x1={x0} x2={x0 + w} y1={y0} y2={y0} className="tf-axis" />
      <line x1={x0} x2={x0} y1={y0 - A - 16} y2={y0 + A + 16} className="tf-axis" />
      {comps.map((c) => (
        <path key={c.k} d={wave((p) => c.a * Math.sin(2 * Math.PI * c.k * p))} className={`tf-comp k${c.k}`} />
      ))}
      <path d={wave(sum)} className="tf-sum" />
      <text x={x0 + w} y={y0 + A + 34} textAnchor="end" className="dg-label small">
        thời gian t →
      </text>

      <g className="tf-arrows">
        <path d="M300 104 H346 M340 98 l6 6 l-6 6" />
        <path d="M346 136 H300 M306 130 l-6 6 l6 6" />
      </g>
      <text x="323" y="94" textAnchor="middle" className="dg-label small">
        Fourier
      </text>
      <text x="323" y="160" textAnchor="middle" className="dg-label small">
        ngược
      </text>

      <text x="372" y="22" className="dg-label strong">
        Miền tần số: biên độ theo f
      </text>
      <line x1="372" x2="624" y1={y0 + A} y2={y0 + A} className="tf-axis" />
      <line x1="372" x2="372" y1={y0 - A - 16} y2={y0 + A} className="tf-axis" />
      {comps.map((c) => (
        <g key={c.k}>
          <rect x={fx(c.k) - 9} y={y0 + A - 2 * A * c.a} width="18" height={2 * A * c.a} className={`tf-bar k${c.k}`} />
          <text x={fx(c.k)} y={y0 + A - 2 * A * c.a - 6} textAnchor="middle" className="dg-label small">
            {c.k === 1 ? "1" : `1/${c.k}`}
          </text>
          <text x={fx(c.k)} y={y0 + A + 18} textAnchor="middle" className="dg-label small">
            {c.k === 1 ? "f" : `${c.k}f`}
          </text>
        </g>
      ))}
      <text x="624" y={y0 + A + 34} textAnchor="end" className="dg-label small">
        tần số →
      </text>
    </svg>
  );
}
