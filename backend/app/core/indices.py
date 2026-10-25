"""CIGRE TB 812 numerical indices (spec 6.3), section 6.2.3, Table 6.2, equations 6.3–6.19.

X = baseline, Y = test, both magnitude in dB on the same frequencies. Values only, no thresholds.
"""
from __future__ import annotations

import math

import numpy as np


def tb812_indices(x: np.ndarray, y: np.ndarray) -> dict[str, float | None]:
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    n = x.size
    out: dict[str, float | None] = {k: None for k in ("CC", "CCF", "LCC", "ASLE", "SD", "CSD", "MD", "MAXABS")}
    if n < 2:
        return out
    d = y - x
    xm, ym = x.mean(), y.mean()
    xd, yd = x - xm, y - ym
    sxx, syy, sxy = float((xd * xd).sum()), float((yd * yd).sum()), float((xd * yd).sum())

    # Eq 6.14: CC = Σ X·Y / √(ΣX² · ΣY²)
    den = math.sqrt(float((x * x).sum()) * float((y * y).sum()))
    out["CC"] = float((x * y).sum()) / den if den > 0 else None
    # Eq 6.13: CCF = Σ(X−X̄)(Y−Ȳ) / √(Σ(X−X̄)² · Σ(Y−Ȳ)²)
    out["CCF"] = sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else None
    # Eq 6.19: LCC = 2·S_XY / ((Ȳ−X̄)² + S_Y² + S_X²), S with 1/N
    den = (ym - xm) ** 2 + syy / n + sxx / n
    out["LCC"] = 2 * (sxy / n) / den if den > 0 else None
    # Eq 6.7: ASLE = Σ|20·log10 Y − 20·log10 X| / N; data already in dB
    out["ASLE"] = float(np.abs(d).sum()) / n
    # Eq 6.3: SD = √(Σ(Y−X)² / (N−1))
    out["SD"] = math.sqrt(float((d * d).sum()) / (n - 1))
    # Eq 6.18: CSD = √(Σ[(Y−Ȳ)−(X−X̄)]² / (N−1))
    e = yd - xd
    out["CSD"] = math.sqrt(float((e * e).sum()) / (n - 1))
    # Eq 6.12: MD = max(Y − X)
    out["MD"] = float(d.max())
    out["MAXABS"] = float(np.abs(d).max())
    return out
