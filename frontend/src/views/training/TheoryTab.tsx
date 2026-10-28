/** Module 1: theory and standards, every statement with the clause it comes from. */
import { useEffect, useRef, useState } from "react";
import { fmtHzShort } from "../../core/quality";
import { frequencyPartitions, type Standards } from "../../core/standards";
import { TRAINING } from "../../core/training/content";
import { LadderDiagram, TimeFreqDiagram } from "../../components/training/Diagrams";
import { Source } from "./shared";

const range = (lo: number, hi: number) =>
  lo <= 0 ? `dưới ${fmtHzShort(hi)}` : Number.isFinite(hi) && hi < 1e11 ? `${fmtHzShort(lo)} – ${fmtHzShort(hi)}` : `trên ${fmtHzShort(lo)}`;

/** Voltage ratios worth knowing by heart, in dB (20·log10) */
const DB_ROWS: { ratio: number; text: string; note: string }[] = [
  { ratio: 10, text: "10", note: "Vout lớn gấp 10 lần Vin" },
  { ratio: 2, text: "2", note: "Vout gấp đôi Vin" },
  { ratio: 1, text: "1", note: "Vout bằng Vin" },
  { ratio: Math.SQRT1_2, text: "0,707 (1/√2)", note: "Một nửa công suất" },
  { ratio: 0.5, text: "0,5", note: "Vout bằng một nửa Vin" },
  { ratio: 0.1, text: "0,1", note: "Nhỏ đi 10 lần" },
  { ratio: 0.01, text: "0,01", note: "Nhỏ đi 100 lần" },
  { ratio: 0.001, text: "0,001", note: "Nhỏ đi 1 000 lần" },
  { ratio: 1e-4, text: "0,0001", note: "Nhỏ đi 10 000 lần" },
];
const dbText = (r: number) => {
  const v = 20 * Math.log10(r);
  const exact = Math.abs(v - Math.round(v)) < 1e-9;
  return `${exact ? "" : "≈ "}${v > 0.05 ? "+" : ""}${v.toFixed(0)}`.replace("-", "−");
};

const TOC_KEY = "sfra.tocCollapsed";

/**
 * Table of contents pinned under the header while the theory scrolls, with the section in view
 * marked. It folds to one line ending in "…" so it covers little of the page; the choice is remembered.
 */
function PinnedToc({ links }: { links: { id: string; title: string }[] }) {
  const [collapsed, setCollapsed] = useState(() => {
    // folded at first on a phone, where the full list would cover much of the screen
    const narrow = typeof matchMedia === "function" && matchMedia("(max-width: 600px)").matches;
    try {
      const saved = localStorage.getItem(TOC_KEY);
      return saved === null ? narrow : saved === "1";
    } catch {
      return narrow;
    }
  });
  const [top, setTop] = useState(0);
  const [current, setCurrent] = useState(links[0]?.id);
  const bar = useRef<HTMLDivElement>(null);

  // sits right under the fixed header, whose height changes when it wraps on narrow screens
  useEffect(() => {
    const head = document.querySelector<HTMLElement>(".topbar");
    if (!head) return;
    const fit = () => setTop(head.offsetHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  // sections jumped to from the contents stop below the header and the contents, not under them
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--toc-offset", `${top + el.offsetHeight + 12}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--toc-offset");
    };
  }, [top]);

  // the section in view: the last one whose top has passed under the contents
  useEffect(() => {
    let frame = 0;
    const look = () => {
      frame = 0;
      const line = top + (bar.current?.offsetHeight ?? 0) + 24;
      let id = links[0]?.id;
      for (const l of links) {
        const el = document.getElementById(`th-${l.id}`);
        if (el && el.getBoundingClientRect().top <= line) id = l.id;
      }
      // at the very bottom the last sections are too short to reach the line: the last one is in view
      const root = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= root.scrollHeight - 2) id = links[links.length - 1]?.id;
      setCurrent(id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(look);
    };
    look();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [links, top]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(TOC_KEY, next ? "1" : "0");
    } catch {
      /* not remembered: folds back to the default next time */
    }
  };

  const at = Math.max(0, links.findIndex((l) => l.id === current));
  const shown = collapsed ? { start: at, links: links.slice(at) } : { start: 0, links };

  return (
    <div ref={bar} className={collapsed ? "toc-bar collapsed" : "toc-bar"} style={{ top }}>
      <nav className="toc" id="theory-toc" aria-label="Mục lục lý thuyết">
        {/* folded: the line starts at the section being read, "…" in front standing for the ones before it */}
        {collapsed && shown.start > 0 && (
          <button type="button" className="link toc-more" onClick={toggle} aria-label="Các mục phía trước, mở rộng mục lục">
            …
          </button>
        )}
        {shown.links.map((l) => (
          <a key={l.id} href={`#th-${l.id}`} aria-current={current === l.id ? "location" : undefined}>
            {l.title}
          </a>
        ))}
      </nav>
      <button
        type="button"
        className="tool-btn toc-toggle"
        aria-controls="theory-toc"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Mở rộng mục lục" : "Thu gọn mục lục còn một dòng"}
        data-tip={collapsed ? "Mở rộng mục lục" : "Thu gọn còn một dòng"}
        onClick={toggle}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d={collapsed ? "M5 8l5 5 5-5" : "M5 12l5-5 5 5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

const TOC_LINKS = [
  ...TRAINING.theory.map((s) => ({ id: s.id, title: s.title })),
  { id: "zones", title: "Ảnh hưởng theo vùng tần số" },
  { id: "partitions", title: "So sánh cách chia dải" },
  { id: "bibliography", title: "Tài liệu tham khảo" },
];

export default function TheoryTab({ std, onOpenLab }: { std: Standards; onOpenLab?: () => void }) {
  const iec = std.iec_zones ?? {};
  const zones = Object.values((iec.zones ?? {}) as Record<string, { label: string; f_min: number; f_max: number; influence?: string }>);
  return (
    <div className="training-tab">
      <PinnedToc links={TOC_LINKS} />

      {TRAINING.theory.map((s) => (
        <section key={s.id} id={`th-${s.id}`} className="theory-section">
          <h2>{s.title}</h2>
          {s.id === "circuit" && <LadderDiagram />}
          {s.id === "signals" && <TimeFreqDiagram />}
          <ul className="sourced">
            {s.items.map((it, i) => (
              <li key={i}>
                {it.text} <Source>{it.source}</Source>
              </li>
            ))}
          </ul>
          {s.id === "transfer" && onOpenLab && (
            <p className="theory-try">
              Xem trực quan Vin đi qua hàm truyền thành Vout, đáp ứng biên độ và pha ở từng tần số:{" "}
              <button className="link" onClick={onOpenLab}>
                mở Lab hàm truyền
              </button>
              .
            </p>
          )}
          {s.id === "decibel" && (
            <div className="table-wrap db-table">
              <table className="grid small">
                <caption>Quy đổi tỉ số điện áp sang dB, tính theo 20 × log10(Vout / Vin)</caption>
                <thead>
                  <tr>
                    <th className="num">Vout / Vin</th>
                    <th className="num">dB</th>
                    <th>Ý nghĩa</th>
                  </tr>
                </thead>
                <tbody>
                  {DB_ROWS.map((r) => (
                    <tr key={r.text}>
                      <td className="num">{r.text}</td>
                      <td className="num">{dbText(r.ratio)}</td>
                      <td>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

      <section id="th-bibliography" className="theory-section">
        <h2>Tài liệu tham khảo</h2>
        <p className="muted small">Tên viết tắt ở cột nguồn ứng với các tài liệu dưới đây; số mục của giáo trình theo đúng lần xuất bản ghi kèm.</p>
        <dl className="bibliography">
          {TRAINING.bibliography.map((b) => (
            <div key={b.key}>
              <dt>{b.key}</dt>
              <dd>{b.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
