"""Grid alignment (spec 5 and 9)."""
from __future__ import annotations

import dataclasses

import numpy as np
import pytest

from app.core.analysis import analyze_pair
from app.core.resample import GridMismatchError, align, log_grid, wrap_deg


def _decimate(trace, step=2):
    return dataclasses.replace(
        trace,
        freq=trace.freq[::step], mag_db=trace.mag_db[::step], phase_deg=trace.phase_deg[::step],
        peaks_db=None if trace.peaks_db is None else trace.peaks_db[::step],
    )


def test_auto_uses_mode_a_on_identical_grid(golden_pairs):
    p = golden_pairs[1]
    assert align(p.baseline.trace, p.tests[0].trace).mode == "A"


def test_mode_a_refuses_different_grids(golden_pairs):
    p = golden_pairs[1]
    with pytest.raises(GridMismatchError):
        align(p.baseline.trace, _decimate(p.tests[0].trace), mode="A")


def test_decimated_test_trace_within_5_percent(golden_pairs, expected, std):
    """Drop every other point of the test trace, interpolate back (spec 9 reference values)."""
    p = golden_pairs[1]
    orig = analyze_pair(p.baseline.trace, p.tests[0].trace, std, mode="A")
    dec = analyze_pair(p.baseline.trace, _decimate(p.tests[0].trace), std)
    assert dec.aligned.mode == "B"
    for band in ("LF", "MF", "HF"):
        a, b = orig.bands[band].rxy, dec.bands[band].rxy
        assert abs(b - a) / a < 0.05, (band, a, b)
    for band, ref in zip(("LF", "MF", "HF"), expected["golden"]["decimated_pair1"]):
        assert dec.bands[band].rxy == pytest.approx(ref, abs=1e-3)


def test_log_grid_mode_c_pair1(golden_pairs, expected, std):
    """Spec 5 quotes pair-1 values on a 200 points/decade grid without saying where the grid points
    sit. The decade-anchored grid used here stays within 1 % of them, same classification as mode A."""
    p = golden_pairs[1]
    a = analyze_pair(p.baseline.trace, p.tests[0].trace, std, mode="A")
    r = analyze_pair(p.baseline.trace, p.tests[0].trace, std, mode="C")
    assert r.aligned.mode == "C"
    for band, ref in zip(("LF", "MF", "HF"), expected["golden"]["logc_pair1_spec"]):
        assert r.bands[band].rxy == pytest.approx(ref, rel=0.01)
    assert r.classification.id == a.classification.id == "normal"


def test_log_grid_density():
    f = log_grid(20.0, 2e6, 200)
    assert f[0] >= 20.0 and f[-1] <= 2e6
    assert f[-1] == pytest.approx(10 ** (1260 / 200))
    # exactly 200 points per full decade, same points whatever the start frequency
    assert np.count_nonzero((f >= 1e3) & (f < 1e4)) == 200
    assert np.allclose(log_grid(20.074, 1.9e6, 200)[-300:], log_grid(25.0, 1.9e6, 200)[-300:])


def test_no_extrapolation(golden_pairs):
    p = golden_pairs[1]
    t = p.tests[0].trace
    short = dataclasses.replace(t, freq=t.freq[100:900], mag_db=t.mag_db[100:900], phase_deg=t.phase_deg[100:900])
    a = align(p.baseline.trace, short, mode="B")
    assert a.freq[0] >= short.freq[0] and a.freq[-1] <= short.freq[-1]


def test_phase_wrap_and_unwrap_interpolation():
    assert wrap_deg(np.array([180.0, -180.0, 190.0, -190.0, 0.0])).tolist() == [180.0, 180.0, -170.0, 170.0, 0.0]
    from app.core.resample import interp_phase

    f = np.array([1.0, 10.0])
    # 170° -> -170° is a +20° step through 180°, the midpoint must be 180°, not 0°
    mid = interp_phase(f, np.array([170.0, -170.0]), np.array([np.sqrt(10.0)]))
    assert mid[0] == pytest.approx(180.0)
