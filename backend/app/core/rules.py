"""Transformer-level conclusion generated from templates filled with computed numbers (spec 6.8).

No free text is written here: every sentence comes from standards.yaml `conclusion.templates`.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..config import Standards
from .analysis import PairResult
from .dlt911 import Classification


def fmt_num(v: float | None, std: Standards, decimals: int | None = None) -> str:
    if v is None:
        return "–"
    d = std["report"]["decimals"] if decimals is None else decimals
    s = f"{v:.{d}f}"
    return s.replace(".", ",") if std["report"].get("decimal_comma", True) else s


def _ref(r: PairResult) -> str:
    return f"{r.index}" if r.index is not None else r.label


@dataclass
class Conclusion:
    worst: Classification
    sentences: list[str]

    @property
    def text(self) -> str:
        return " ".join(self.sentences)


def transformer_conclusion(results: list[PairResult], std: Standards) -> Conclusion:
    if not results:
        raise ValueError("Không có phép đo nào để kết luận")
    t = std["conclusion"]["templates"]
    worst = max((r.classification for r in results), key=lambda c: c.rank)
    n_normal = sum(1 for r in results if r.classification.id == "normal")
    n_total = len(results)

    if n_normal == n_total:
        first = t["all_normal"].format(n_normal=n_normal, n_total=n_total)
    else:
        worst_items = [r for r in results if r.classification.id == worst.id]
        first = t["not_all_normal"].format(
            n_normal=n_normal, n_total=n_total, worst_label=worst.label,
            worst_list=", ".join(f"phép đo {_ref(r)}, {r.label}" for r in worst_items),
        )
    sentences = [first]

    mins = []
    for band in ("LF", "HF"):
        have = [r for r in results if r.bands[band].rxy is not None]
        if have:
            m = min(have, key=lambda r: r.bands[band].rxy)
            mins.append(t["min_band"].format(
                band=f"R{band}", value=fmt_num(m.bands[band].rxy, std), index=_ref(m), label=m.label,
            ))
    if mins:
        sentences.append("; ".join(mins) + ".")

    reversed_ = [r for r in results if any(w.code == "reversed_leads" for w in r.warnings)]
    if reversed_:
        sentences.append(t["reversed_leads"].format(
            count=len(reversed_), list=", ".join(f"{_ref(r)} {r.label}" for r in reversed_),
        ))
    diff = [r for r in results if any(w.code.startswith("diff_") for w in r.warnings)]
    if diff:
        sentences.append(t["config_diff"].format(
            count=len(diff), list=", ".join(f"{_ref(r)} {r.label}" for r in diff),
        ))
    modes = sorted({r.aligned.mode_label for r in results})
    sentences.append(t["resample"].format(mode="; ".join(modes)))
    return Conclusion(worst=worst, sentences=sentences)
