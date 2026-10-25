"""Analyze one baseline/test pair: align grids, DL/T 911 bands, classification, warnings."""
from __future__ import annotations

from dataclasses import dataclass, field

from ..config import Standards
from ..parsers.base import Trace
from .dlt911 import BandResult, Classification, action_for, classify, compute_bands
from .quality import QualityWarning, check_pair, check_trace
from .resample import AlignedPair, align


@dataclass
class PairResult:
    index: int | None
    label: str
    baseline: Trace
    test: Trace
    aligned: AlignedPair
    bands: dict[str, BandResult]
    classification: Classification
    action: str
    warnings: list[QualityWarning] = field(default_factory=list)
    ruleset_version: str = ""

    @property
    def rxy(self) -> dict[str, float | None]:
        return {k: b.rxy for k, b in self.bands.items()}


def analyze_pair(
    ref: Trace,
    test: Trace,
    std: Standards,
    mode: str | None = None,
    index: int | None = None,
    label: str = "",
    um_kv: float | None = None,
) -> PairResult:
    r = std["resample"]
    aligned = align(
        ref, test,
        mode=mode or r["default_mode"],
        points_per_decade=r["log_grid_points_per_decade"],
        rtol=r["grid_match_rtol"],
    )
    bands = compute_bands(aligned.freq, aligned.x_db, aligned.y_db, std)
    values = {k: b.rxy for k, b in bands.items()}
    cls = classify(values, std)
    warnings = check_pair(ref, test, std) + check_trace(test, std, um_kv)
    return PairResult(
        index=index, label=label, baseline=ref, test=test, aligned=aligned, bands=bands,
        classification=cls, action=action_for(cls.id, std),
        warnings=warnings, ruleset_version=std.version_tag,
    )
