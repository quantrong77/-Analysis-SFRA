/** Small line icons for the navigation rail (24×24 grid, stroke = currentColor). */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const ICONS: Record<string, JSX.Element> = {
  // transformer: two windings on a core
  overview: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M9 8v8M15 8v8M7 10h4M7 14h4M13 10h4M13 14h4" />
    </svg>
  ),
  import: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
    </svg>
  ),
  results: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M4 6h16M4 10h16M4 14h16M4 18h16M9 6v12" />
    </svg>
  ),
  // frequency response curve on log axes
  detail: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M4 4v16h16" />
      <path d="M6 15c2-1 3-7 5-7s2 9 4 9 2-6 4-8" />
    </svg>
  ),
  trend: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M4 4v16h16" />
      <path d="M7 9l4 2 4-1 4 5" />
      <circle cx="7" cy="9" r="1" />
      <circle cx="11" cy="11" r="1" />
      <circle cx="15" cy="10" r="1" />
      <circle cx="19" cy="15" r="1" />
    </svg>
  ),
  compare: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M4 16c3-6 5-6 8 0s5 6 8 0" />
      <path d="M4 10c3-6 5-6 8 0s5 6 8 0" strokeDasharray="2 2.5" />
    </svg>
  ),
  report: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 15h5M10 18h3" />
    </svg>
  ),
  // open book: the training material
  training: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Z" />
      <path d="M12 6.5V19" />
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.7" />
      <circle cx="12" cy="16.8" r=".6" />
    </svg>
  ),
  about: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r=".6" />
    </svg>
  ),
  standards: (
    <svg viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M5 7h9M18 7h1M5 12h3M12 12h7M5 17h11M20 17h-1" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="17" r="2" />
    </svg>
  ),
};

/** Menu toggle: a panel with its left column, open or folded away. */
export function RailIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden {...P}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M9 4.5v15" />
      {open ? <path d="M15.5 9.5 13 12l2.5 2.5" /> : <path d="M13 9.5l2.5 2.5-2.5 2.5" />}
    </svg>
  );
}

/** Brand mark: a winding coil whose last turn becomes a frequency response. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden>
      <rect width="40" height="40" rx="7" fill="var(--winding)" />
      <path
        d="M7 26c0-6 4-6 4 0s4 6 4 0-4-6-4 0M15 26c0-6 4-6 4 0M19 26c3-12 5-12 7-2s3 6 7-12"
        fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
