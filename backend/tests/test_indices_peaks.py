"""TB 812 indices and peak analysis (spec 6.3, 6.4)."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

import numpy as np
import pytest

from app.core.dlt911 import band_mask, relative_factor
from app.core.indices import tb812_indices
from app.core.peaks import find_extrema, match_extrema


def test_identical_traces():
    x = np.sin(np.linspace(0, 12, 300)) * 10 - 40
    r = tb812_indices(x, x)
    assert r["CC"] == pytest.approx(1) and r["CCF"] == pytest.approx(1) and r["LCC"] == pytest.approx(1)
    assert r["ASLE"] == 0 and r["SD"] == 0 and r["CSD"] == 0 and r["MD"] == 0 and r["MAXABS"] == 0


def test_by_hand():
    x = np.array([1.0, 2.0, 3.0, 4.0])
    y = np.array([1.0, 2.0, 2.0, 5.0])
    r = tb812_indices(x, y)
    assert r["CC"] == pytest.approx(31 / math.sqrt(30 * 34))  # ΣXY = 1+4+6+20, ΣX² = 30, ΣY² = 34
    assert r["CCF"] == pytest.approx(1.5 / math.sqrt(1.25 * 2.25))
    assert r["LCC"] == pytest.approx(2 * 1.5 / (0 + 2.25 + 1.25))
    assert r["ASLE"] == pytest.approx(0.5)
    assert r["SD"] == pytest.approx(math.sqrt(2 / 3))
    assert r["CSD"] == pytest.approx(math.sqrt(2 / 3))
    assert r["MD"] == 1.0 and r["MAXABS"] == 1.0
    # a constant offset leaves CCF at 1 but LCC and SD see it
    r2 = tb812_indices(x, x + 3)
    assert r2["CCF"] == pytest.approx(1) and r2["LCC"] < 1 and r2["SD"] > 0 and r2["CSD"] == pytest.approx(0)


def test_ccf_equals_dlt911_lrxy(golden_pairs, std):
    p = golden_pairs[1]
    x, y, f = p.baseline.trace.mag_db, p.tests[0].trace.mag_db, p.baseline.trace.freq
    m = band_mask(f, std["dlt911"]["bands"]["LF"])
    assert tb812_indices(x[m], y[m])["CCF"] == pytest.approx(relative_factor(x[m], y[m])["lrxy"], rel=1e-12)


def test_peak_matching_synthetic():
    f = np.logspace(3, 6, 2000)
    lf = np.log10(f)

    def curve(shift):
        return -40 + 15 * np.exp(-((lf - np.log10(2e4 * (1 + shift))) / 0.02) ** 2) \
                   - 12 * np.exp(-((lf - np.log10(2e5)) / 0.02) ** 2)

    ref = find_extrema(f, curve(0.0), 1.5)
    test = find_extrema(f, curve(0.08), 1.5)
    assert [e.kind for e in ref] == ["peak", "notch"]
    m = match_extrema(ref, test, 0.10)
    peak = next(x for x in m if x.kind == "peak")
    assert peak.shift_percent == pytest.approx(8.0, abs=0.5)
    notch = next(x for x in m if x.kind == "notch")
    assert abs(notch.shift_percent) < 0.5
    # outside the ±10 % window the peak is reported lost + new
    m2 = match_extrema(ref, find_extrema(f, curve(0.3), 1.5), 0.10)
    assert sorted((x.ref is None, x.test is None) for x in m2 if x.kind == "peak") == [(False, True), (True, False)]


def test_export_fixture_for_typescript(golden_pairs, std):
    """Writes scipy results for pair 1 so the TypeScript port can be checked against them.
    The output belongs to the test data outside the repository (key "scipy_pair1" of golden_expected.json)."""
    out = os.environ.get("SFRA_PEAK_FIXTURE")
    if not out:
        pytest.skip("set SFRA_PEAK_FIXTURE to export")
    p = golden_pairs[1]
    b, t = p.baseline.trace, p.tests[0].trace
    data = {
        "baseline": [e.__dict__ for e in find_extrema(b.freq, b.mag_db, 1.5)],
        "test": [e.__dict__ for e in find_extrema(t.freq, t.mag_db, 1.5)],
        "indices": {k: tb812_indices(b.mag_db[band_mask(b.freq, c)], t.mag_db[band_mask(b.freq, c)])
                    for k, c in std["dlt911"]["bands"].items()},
    }
    Path(out).write_text(json.dumps(data, indent=1), encoding="utf-8")
