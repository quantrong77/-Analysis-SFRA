"""Quality checks at import (spec 4.3)."""
from __future__ import annotations

import dataclasses

from app.core.quality import check_pair, check_trace
from app.parsers.base import TestSetting


def test_golden_trace_quality(golden_traces, std):
    codes = {w.code for w in check_trace(golden_traces[0], std, um_kv=220)}
    # 20 Hz – 1.989 MHz, ~208 points/decade: only the DL/T 911 step note is expected
    assert codes == {"dlt911_step"}


def test_fmax_low_voltage_requirement(golden_traces, std):
    codes = {w.code for w in check_trace(golden_traces[0], std, um_kv=35)}
    assert "fmax_low" in codes   # Um <= 72,5 kV requires 2 MHz


def test_missing_band(golden_traces, std):
    t = golden_traces[0]
    m = t.freq <= 500000
    short = dataclasses.replace(t, freq=t.freq[m], mag_db=t.mag_db[m], phase_deg=t.phase_deg[m])
    codes = {w.code for w in check_trace(short, std)}
    assert {"coverage", "band_missing_HF", "fmax_low"} <= codes


def test_config_difference(golden_traces, std):
    t = golden_traces[0]
    other = dataclasses.replace(t, setting=dataclasses.replace(t.setting, shorted_terminal="a b c", ltc_position="9b"))
    codes = {w.code for w in check_pair(t, other, std)}
    assert codes == {"diff_shorted_terminal", "diff_ltc_position"}


def test_terminal_aliases(golden_traces, std):
    t = golden_traces[0]
    a = dataclasses.replace(t, setting=TestSetting(red_lead="H1", black_lead="HOXO", shorted_terminal="X1-X2-X3-X1"))
    b = dataclasses.replace(t, setting=TestSetting(red_lead="A", black_lead="N", shorted_terminal="a-b-c-a"))
    assert check_pair(a, b, std) == []
    # case matters: A (HV) is not a (LV)
    c = dataclasses.replace(t, setting=TestSetting(red_lead="a", black_lead="N", shorted_terminal="a-b-c-a"))
    assert [w.code for w in check_pair(a, c, std)] == ["different_leads"]


def test_reversed_leads(golden_traces, std):
    t = golden_traces[0]
    a = dataclasses.replace(t, setting=TestSetting(red_lead="Y1", black_lead="Y2"))
    b = dataclasses.replace(t, setting=TestSetting(red_lead="Y2", black_lead="Y1"))
    assert [w.code for w in check_pair(a, b, std)] == ["reversed_leads"]
