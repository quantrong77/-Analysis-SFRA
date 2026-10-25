"""Frequency-grid alignment of two traces before computing indices (spec 5).

Mode A: identical grids, used as-is (matches Excel v6).
Mode B: test trace interpolated onto the baseline frequencies inside the common range.
Mode C: both traces interpolated onto a standard log grid (N points/decade).
Interpolation is linear in log10(f), values in dB, never extrapolated.
Phase is unwrapped (radians) before interpolation and wrapped back to (-180, 180].
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from ..parsers.base import Trace

MODE_LABELS = {
    "A": "A – Nguyên bản",
    "B": "B – Theo lưới baseline",
    "C": "C – Lưới log chuẩn",
}


class GridMismatchError(ValueError):
    pass


@dataclass
class AlignedPair:
    freq: np.ndarray
    x_db: np.ndarray        # baseline
    y_db: np.ndarray        # test
    x_phase: np.ndarray
    y_phase: np.ndarray
    mode: str               # "A" | "B" | "C" (actual mode used)
    requested_mode: str
    f_lo: float
    f_hi: float
    points_per_decade: int | None = None

    @property
    def n_points(self) -> int:
        return int(self.freq.size)

    @property
    def mode_label(self) -> str:
        label = MODE_LABELS[self.mode]
        if self.mode == "C" and self.points_per_decade:
            label += f" {self.points_per_decade} điểm/decade"
        return label


def grids_match(fa: np.ndarray, fb: np.ndarray, rtol: float = 1e-6) -> bool:
    return fa.shape == fb.shape and bool(np.all(np.abs(fa - fb) <= rtol * np.abs(fa)))


def wrap_deg(p: np.ndarray) -> np.ndarray:
    """Wrap angles to (-180, 180]."""
    return 180.0 - np.mod(180.0 - p, 360.0)


def interp_log(f_src: np.ndarray, v_src: np.ndarray, f_dst: np.ndarray) -> np.ndarray:
    lo, hi = f_src[0], f_src[-1]
    if f_dst.size and (f_dst[0] < lo * (1 - 1e-12) or f_dst[-1] > hi * (1 + 1e-12)):
        raise ValueError("Không ngoại suy: tần số đích nằm ngoài dải tần nguồn")
    return np.interp(np.log10(f_dst), np.log10(f_src), v_src)


def interp_phase(f_src: np.ndarray, p_deg: np.ndarray, f_dst: np.ndarray) -> np.ndarray:
    unwrapped = np.unwrap(np.deg2rad(p_deg))
    return wrap_deg(np.rad2deg(interp_log(f_src, unwrapped, f_dst)))


def log_grid(f_lo: float, f_hi: float, points_per_decade: int) -> np.ndarray:
    """Decade-anchored log grid f = 10^(k/N) inside [f_lo, f_hi].

    The grid does not depend on each file's start frequency, so every session of a
    transformer is compared on the same frequencies (needed for trend analysis).
    """
    k_lo = math.ceil(math.log10(f_lo) * points_per_decade - 1e-9)
    k_hi = math.floor(math.log10(f_hi) * points_per_decade + 1e-9)
    f = 10.0 ** (np.arange(k_lo, k_hi + 1) / points_per_decade)
    return f[(f >= f_lo) & (f <= f_hi)]


def align(
    ref: Trace,
    test: Trace,
    mode: str = "auto",
    points_per_decade: int = 200,
    rtol: float = 1e-6,
) -> AlignedPair:
    requested = mode
    same = grids_match(ref.freq, test.freq, rtol)
    if mode == "auto":
        mode = "A" if same else "B"
    if mode == "A":
        if not same:
            raise GridMismatchError(
                f"Hai file khác lưới tần số ({ref.n_points} và {test.n_points} điểm); dùng chế độ B hoặc C"
            )
        return AlignedPair(
            freq=ref.freq.copy(), x_db=ref.mag_db.copy(), y_db=test.mag_db.copy(),
            x_phase=ref.phase_deg.copy(), y_phase=test.phase_deg.copy(),
            mode="A", requested_mode=requested, f_lo=ref.f_min, f_hi=ref.f_max,
        )

    f_lo = max(ref.f_min, test.f_min)
    f_hi = min(ref.f_max, test.f_max)
    if not f_lo < f_hi:
        raise GridMismatchError("Hai file không có vùng tần số chung")

    if mode == "B":
        mask = (ref.freq >= f_lo) & (ref.freq <= f_hi)
        f = ref.freq[mask]
        return AlignedPair(
            freq=f, x_db=ref.mag_db[mask], y_db=interp_log(test.freq, test.mag_db, f),
            x_phase=ref.phase_deg[mask], y_phase=interp_phase(test.freq, test.phase_deg, f),
            mode="B", requested_mode=requested, f_lo=float(f[0]), f_hi=float(f[-1]),
        )

    if mode == "C":
        f = log_grid(f_lo, f_hi, points_per_decade)
        return AlignedPair(
            freq=f,
            x_db=interp_log(ref.freq, ref.mag_db, f), y_db=interp_log(test.freq, test.mag_db, f),
            x_phase=interp_phase(ref.freq, ref.phase_deg, f), y_phase=interp_phase(test.freq, test.phase_deg, f),
            mode="C", requested_mode=requested, f_lo=f_lo, f_hi=f_hi, points_per_decade=points_per_decade,
        )

    raise ValueError(f"Chế độ căn lưới không hợp lệ: {mode}")
