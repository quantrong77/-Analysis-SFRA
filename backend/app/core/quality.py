"""Data-quality checks at import (spec 4.3). They warn, never block."""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import numpy as np

from ..config import Standards
from ..parsers.base import Trace
from .dlt911 import band_mask


@dataclass
class QualityWarning:
    code: str
    severity: str           # "warning" | "note"
    message: str
    source: str

    def to_dict(self) -> dict:
        return asdict(self)


def _fmt_hz(f: float) -> str:
    if f >= 1e6:
        return f"{f / 1e6:.3f} MHz"
    if f >= 1e3:
        return f"{f / 1e3:.3f} kHz"
    return f"{f:.3f} Hz"


def check_trace(trace: Trace, std: Standards, um_kv: float | None = None) -> list[QualityWarning]:
    q = std["quality"]
    out: list[QualityWarning] = []
    f = trace.freq

    # f_max (IEC 60076-18, 4.5). Um unknown -> apply the 1 MHz minimum (Um > 72,5 kV).
    c = q["fmax"]
    if um_kv is not None and um_kv > 0 and um_kv <= c["um_threshold_kv"]:
        need, cond = c["min_fmax_hz_um_below"], f"Um ≤ {c['um_threshold_kv']} kV"
    else:
        need, cond = c["min_fmax_hz_um_above"], f"Um > {c['um_threshold_kv']} kV"
    if trace.f_max < need:
        out.append(QualityWarning(
            "fmax_low", "warning",
            f"Tần số cao nhất {_fmt_hz(trace.f_max)} nhỏ hơn yêu cầu {_fmt_hz(need)} ({cond})", c["source"],
        ))

    # Point density (IEC 60076-18, 4.5)
    c = q["density"]
    lim = c["low_freq_limit_hz"]
    low = f[f <= lim]
    if low.size >= 2:
        step = float(np.max(np.diff(low)))
        if step > c["max_step_below_limit_hz"]:
            out.append(QualityWarning(
                "density_low_freq", "warning",
                f"Dưới {lim:g} Hz bước quét lớn nhất {step:.3f} Hz > {c['max_step_below_limit_hz']:g} Hz", c["source"],
            ))
    start = max(lim, trace.f_min)
    k = math.ceil(math.log10(start) - 1e-12)
    while 10 ** (k + 1) <= trace.f_max * (1 + 1e-12):
        cnt = int(np.count_nonzero((f >= 10 ** k) & (f < 10 ** (k + 1))))
        if cnt < c["min_points_per_decade"]:
            out.append(QualityWarning(
                "density_decade", "warning",
                f"Decade {_fmt_hz(10 ** k)}–{_fmt_hz(10 ** (k + 1))} có {cnt} điểm < {c['min_points_per_decade']} điểm/decade",
                c["source"],
            ))
        k += 1

    # DL/T 911 sweep step 1 kHz–1 MHz (note only: log sweeps have large HF steps)
    c = q["dlt911_step"]
    seg = f[(f >= c["f_min"]) & (f <= c["f_max"])]
    if seg.size >= 2:
        step = float(np.max(np.diff(seg)))
        if step > c["max_step_hz"]:
            out.append(QualityWarning(
                "dlt911_step", c.get("severity", "note"),
                f"Bước quét lớn nhất trong 1 kHz–1 MHz là {_fmt_hz(step)} > {_fmt_hz(c['max_step_hz'])}. {c['note']}",
                c["source"],
            ))

    # Coverage of the DL/T 911 range and of each band
    c = q["coverage"]
    if trace.f_min > c["f_min"] or trace.f_max < c["f_max"]:
        out.append(QualityWarning(
            "coverage", "warning",
            f"Dải tần đo {_fmt_hz(trace.f_min)}–{_fmt_hz(trace.f_max)} không phủ {_fmt_hz(c['f_min'])}–{_fmt_hz(c['f_max'])}",
            c["source"],
        ))
    for name, bcfg in std["dlt911"]["bands"].items():
        if np.count_nonzero(band_mask(f, bcfg)) < 2:
            out.append(QualityWarning(
                f"band_missing_{name}", "warning", f"Thiếu dữ liệu dải {name} ({bcfg['label']})", bcfg["source"],
            ))
    return out


def _norm(s: str) -> str:
    return " ".join(s.split()).casefold()


def _terminal(s: str, aliases: dict[str, str]) -> str:
    """Case-sensitive: 'A' (HV) and 'a' (LV) are different terminals."""
    s = s.strip()
    return aliases.get(s, s)


def _terminal_list(s: str, aliases: dict[str, str]) -> str:
    """'X1-X2-X3-X1' -> 'a-b-c-a'; free text such as 'none' is compared case-insensitively."""
    parts = [p.strip() for p in s.split("-")]
    if len(parts) > 1 and all(parts):
        return "-".join(_terminal(p, aliases) for p in parts)
    return _norm(_terminal(s, aliases))


def _value(s: str, groups: list[list[str]]) -> str:
    v = _norm(s)
    for g in groups:
        if v in {_norm(x) for x in g}:
            return _norm(g[0])
    return v


def check_pair(ref: Trace, test: Trace, std: Standards) -> list[QualityWarning]:
    """Compare measurement configuration of baseline and test."""
    c = std["quality"]["pair"]
    aliases = c.get("terminal_aliases", {}).get("map", {})
    groups = c.get("value_equivalents", {}).get("groups", [])
    out: list[QualityWarning] = []
    rs, ts = ref.setting, test.setting
    if rs.red_lead or rs.black_lead:
        r_red, r_black = _terminal(rs.red_lead, aliases), _terminal(rs.black_lead, aliases)
        t_red, t_black = _terminal(ts.red_lead, aliases), _terminal(ts.black_lead, aliases)
        same = (r_red, r_black) == (t_red, t_black)
        swapped = (r_red, r_black) == (t_black, t_red)
        if swapped and not same:
            out.append(QualityWarning(
                "reversed_leads", "warning",
                f"Đầu đo đảo so với baseline (baseline {rs.red_lead}→{rs.black_lead}, lần đo {ts.red_lead}→{ts.black_lead})",
                c["source"],
            ))
        elif not same:
            out.append(QualityWarning(
                "different_leads", "warning",
                f"Đầu đo khác baseline (baseline {rs.red_lead}→{rs.black_lead}, lần đo {ts.red_lead}→{ts.black_lead})",
                c["source"],
            ))
    terminal_fields = {"shorted_terminal", "grounded_terminal"}
    for attr, label in c["compare_fields"].items():
        a, b = getattr(rs, attr), getattr(ts, attr)
        if attr in terminal_fields:
            differ = _terminal_list(a, aliases) != _terminal_list(b, aliases)
        else:
            differ = _value(a, groups) != _value(b, groups)
        if differ:
            out.append(QualityWarning(
                f"diff_{attr}", "warning", f"{label} khác baseline (baseline \"{a}\", lần đo \"{b}\")", c["source"],
            ))
    return out
