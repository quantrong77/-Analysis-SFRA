"""Resonance peaks / notches and their shifts (spec 6.4).

Detection: scipy.signal.find_peaks with `prominence` on the dB curve (notches: on −dB).
Matching: each baseline extremum to the nearest test extremum of the same kind in log10(f),
within ±window, one-to-one, closest pairs first.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.signal import find_peaks


@dataclass
class Extremum:
    kind: str          # "peak" | "notch"
    index: int
    freq: float
    db: float
    prominence: float


def find_extrema(freq: np.ndarray, db: np.ndarray, prominence: float) -> list[Extremum]:
    out: list[Extremum] = []
    for kind, sig in (("peak", db), ("notch", -db)):
        idx, props = find_peaks(sig, prominence=prominence)
        for i, p in zip(idx, props["prominences"]):
            out.append(Extremum(kind, int(i), float(freq[i]), float(db[i]), float(p)))
    return sorted(out, key=lambda e: e.freq)


@dataclass
class PeakMatch:
    kind: str
    ref: Extremum | None
    test: Extremum | None

    @property
    def shift_percent(self) -> float | None:
        if self.ref and self.test:
            return (self.test.freq - self.ref.freq) / self.ref.freq * 100.0
        return None


def match_extrema(ref: list[Extremum], test: list[Extremum], window: float) -> list[PeakMatch]:
    matches: list[PeakMatch] = []
    for kind in ("peak", "notch"):
        r = [e for e in ref if e.kind == kind]
        t = [e for e in test if e.kind == kind]
        cand = []
        for i, a in enumerate(r):
            for j, b in enumerate(t):
                if abs(b.freq / a.freq - 1.0) <= window:
                    cand.append((abs(np.log10(b.freq / a.freq)), i, j))
        cand.sort()
        used_r: set[int] = set()
        used_t: set[int] = set()
        for _, i, j in cand:
            if i in used_r or j in used_t:
                continue
            used_r.add(i)
            used_t.add(j)
            matches.append(PeakMatch(kind, r[i], t[j]))
        matches += [PeakMatch(kind, a, None) for i, a in enumerate(r) if i not in used_r]
        matches += [PeakMatch(kind, None, b) for j, b in enumerate(t) if j not in used_t]
    return sorted(matches, key=lambda m: (m.ref or m.test).freq)
