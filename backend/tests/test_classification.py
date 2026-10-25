"""DL/T 911-2004 Table A.1: at least one case per row, including boundaries (spec 9)."""
from __future__ import annotations

import numpy as np
import pytest

from app.core.dlt911 import action_for, classify, relative_factor


@pytest.mark.parametrize(
    "rlf,rmf,rhf,expected",
    [
        # Severe: RLF < 0.6
        (0.3, 2.0, 2.0, "severe"),
        (0.599, 0.1, 0.1, "severe"),
        # Obvious: 0.6 <= RLF < 1.0 or RMF < 0.6
        (0.6, 2.0, 2.0, "obvious"),      # boundary RLF = 0.6
        (0.99, 2.0, 2.0, "obvious"),
        (2.5, 0.5, 2.0, "obvious"),      # RMF < 0.6 with good RLF
        (1.5, 0.59, 2.0, "obvious"),     # RMF < 0.6 outranks slight RLF
        # Slight: 1.0 <= RLF < 2.0 or 0.6 <= RMF < 1.0
        (1.0, 2.0, 2.0, "slight"),       # boundary RLF = 1.0
        (1.99, 2.0, 2.0, "slight"),
        (2.5, 0.6, 2.0, "slight"),       # boundary RMF = 0.6
        (2.5, 0.99, 2.0, "slight"),
        # Normal: RLF >= 2.0 and RMF >= 1.0 and RHF >= 0.6
        (2.0, 1.0, 0.6, "normal"),       # boundaries RLF = 2.0, RMF = 1.0, RHF = 0.6
        (2.7227, 2.6717, 1.4528, "normal"),
        # Not in Table A.1: RLF >= 2, RMF >= 1, RHF < 0.6
        (2.5, 1.5, 0.59, "review"),
        (2.0, 1.0, 0.0, "review"),
    ],
)
def test_table_a1(rlf, rmf, rhf, expected, std):
    c = classify({"LF": rlf, "MF": rmf, "HF": rhf}, std)
    assert c.id == expected
    assert action_for(c.id, std)


def test_review_level_is_marked_outside_standard(std):
    c = classify({"LF": 3.0, "MF": 3.0, "HF": 0.2}, std)
    assert c.in_standard is False
    assert "IEC 60076-18, Phụ lục B" in c.note


def test_missing_band_is_insufficient(std):
    assert classify({"LF": 3.0, "MF": None, "HF": 1.0}, std).id == "insufficient"


def test_identical_sequences_give_rxy_10():
    x = np.sin(np.linspace(0, 20, 400)) * 10 - 30
    r = relative_factor(x, x.copy())
    assert r["rxy"] == 10.0
    assert r["lrxy"] == pytest.approx(1.0)


def test_self_compare_golden_file(golden_traces, std):
    from app.core.analysis import analyze_pair

    t = golden_traces[0]
    r = analyze_pair(t, t, std)
    assert all(b.rxy == 10.0 for b in r.bands.values())


def test_rxy_formula_by_hand():
    x = np.array([1.0, 2.0, 3.0, 4.0])
    y = np.array([1.0, 2.0, 2.0, 5.0])
    r = relative_factor(x, y)
    assert r["x_mean"] == 2.5 and r["y_mean"] == 2.5
    assert r["dx"] == pytest.approx(1.25)
    assert r["dy"] == pytest.approx(2.25)
    assert r["cxy"] == pytest.approx(1.5)
    lr = 1.5 / np.sqrt(1.25 * 2.25)
    assert r["lrxy"] == pytest.approx(lr)
    assert r["rxy"] == pytest.approx(-np.log10(1 - lr))


def test_zero_variance_has_no_rxy():
    r = relative_factor(np.ones(10), np.arange(10.0))
    assert r.get("rxy") is None and r["note"]
