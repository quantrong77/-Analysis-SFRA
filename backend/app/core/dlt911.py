"""DL/T 911-2004, Appendix A: relative factor Rxy per band and classification (spec 6.1)."""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import numpy as np

from ..config import Standards


@dataclass
class BandResult:
    """Intermediate values of DL/T 911-2004 A.1–A.4, shown in full so they can be checked by hand."""

    band: str
    label: str
    f_min: float
    f_max: float
    include_min: bool
    include_max: bool
    threshold: float
    source: str
    n: int
    x_mean: float | None = None
    y_mean: float | None = None
    dx: float | None = None
    dy: float | None = None
    cxy: float | None = None
    lrxy: float | None = None
    rxy: float | None = None
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def relative_factor(x: np.ndarray, y: np.ndarray, rxy_max: float = 10.0, eps: float = 1e-10) -> dict:
    """A.1–A.4 on two equal-length dB sequences X (baseline), Y (test)."""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    n = int(x.size)
    out: dict = {"n": n}
    if n < 2:
        out["note"] = "Ít hơn 2 điểm trong dải"
        return out
    x_mean = float(x.sum() / n)
    y_mean = float(y.sum() / n)
    xd = x - x_mean
    yd = y - y_mean
    dx = float((xd * xd).sum() / n)
    dy = float((yd * yd).sum() / n)
    cxy = float((xd * yd).sum() / n)
    out.update(x_mean=x_mean, y_mean=y_mean, dx=dx, dy=dy, cxy=cxy)
    if dx <= 0.0 or dy <= 0.0:
        out["note"] = "Phương sai bằng 0, không tính được LRxy"
        return out
    lrxy = cxy / math.sqrt(dx * dy)
    rxy = rxy_max if (1.0 - lrxy) < eps else -math.log10(1.0 - lrxy)
    out.update(lrxy=lrxy, rxy=rxy)
    return out


def band_mask(freq: np.ndarray, cfg: dict) -> np.ndarray:
    lo, hi = cfg["f_min"], cfg["f_max"]
    m_lo = freq >= lo if cfg.get("include_min", True) else freq > lo
    m_hi = freq <= hi if cfg.get("include_max", True) else freq < hi
    return m_lo & m_hi


def compute_bands(freq: np.ndarray, x_db: np.ndarray, y_db: np.ndarray, std: Standards) -> dict[str, BandResult]:
    d = std["dlt911"]
    results: dict[str, BandResult] = {}
    for name, cfg in d["bands"].items():
        mask = band_mask(freq, cfg)
        rf = relative_factor(x_db[mask], y_db[mask], d["rxy_max"], d["rxy_eps"])
        results[name] = BandResult(
            band=name, label=cfg["label"], f_min=cfg["f_min"], f_max=cfg["f_max"],
            include_min=cfg.get("include_min", True), include_max=cfg.get("include_max", True),
            threshold=cfg["threshold"], source=cfg["source"], **rf,
        )
    return results


@dataclass
class Classification:
    id: str
    label: str
    label_en: str
    rank: int
    in_standard: bool
    source: str
    note: str = ""


_OPS = {
    "lt": lambda v, t: v < t,
    "le": lambda v, t: v <= t,
    "gt": lambda v, t: v > t,
    "ge": lambda v, t: v >= t,
}


def rxy_names(values: dict[str, float | None]) -> dict[str, float | None]:
    """{'LF': v} -> {'RLF': v}: the names used in standards.yaml clauses and FSI weights."""
    return {f"R{band}": v for band, v in values.items()}


def _clause_holds(clause: dict, values: dict[str, float]) -> bool:
    for band, conds in clause.items():
        v = values[band]
        for op, t in conds.items():
            if not _OPS[op](v, t):
                return False
    return True


def classify(values: dict[str, float | None], std: Standards) -> Classification:
    """Table A.1, checked from most to least severe; the first matching level wins.

    `values` is keyed by band name: {'LF': RLF, 'MF': RMF, 'HF': RHF}.
    """
    c = std["dlt911"]["classification"]
    if any(values.get(b) is None for b in std["dlt911"]["bands"]):
        ins = c["insufficient"]
        return Classification(ins["id"], ins["label"], ins["label_en"], ins["rank"], False, ins["source"], ins["note"])
    values = rxy_names(values)
    for level in c["levels"]:
        if any(_clause_holds(cl, values) for cl in level["any"]):
            return Classification(
                id=level["id"], label=level["label"], label_en=level["label_en"], rank=level["rank"],
                in_standard=level["in_standard"], source=level.get("source", c["source"]), note=level.get("note", ""),
            )
    raise AssertionError(f"Không mức nào khớp với {values}; kiểm tra lại standards.yaml")


def action_for(level_id: str, std: Standards) -> str:
    return std["actions"]["by_level"].get(level_id, "")
