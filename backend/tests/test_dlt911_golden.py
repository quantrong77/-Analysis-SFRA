"""Golden test (spec 9): 18 pairs, grid mode A, Rxy within 1e-4 of the Excel v6 values.
Expected values are read from the file outside the repository (see conftest)."""
from __future__ import annotations

import pytest

from app.core.analysis import analyze_pair
from app.core.rules import transformer_conclusion

TOL = 1e-4


def test_pairing_finds_18_pairs(golden_pairs, expected):
    assert sorted(golden_pairs) == sorted(int(k) for k in expected["golden"]["rxy"])
    for p in golden_pairs.values():
        # baseline = oldest session, one test file per pair, same STT + label
        assert len(p.tests) == 1
        assert p.baseline.info.timestamp < p.tests[0].info.timestamp
        assert p.baseline.info.key == p.tests[0].info.key


def test_rxy_matches_excel(golden_pairs, expected, std):
    for stt, (rlf, rmf, rhf) in expected["golden"]["rxy"].items():
        p = golden_pairs[int(stt)]
        r = analyze_pair(p.baseline.trace, p.tests[0].trace, std, mode="A", index=int(stt), label=p.key[1])
        assert r.aligned.mode == "A"
        assert r.bands["LF"].rxy == pytest.approx(rlf, abs=TOL), stt
        assert r.bands["MF"].rxy == pytest.approx(rmf, abs=TOL), stt
        assert r.bands["HF"].rxy == pytest.approx(rhf, abs=TOL), stt
        assert r.classification.id == "normal"


def test_points_and_band_counts(golden_traces, golden_pairs, expected, std):
    g = expected["golden"]
    for t in golden_traces:
        assert t.n_points == g["points"]
        assert t.f_min == pytest.approx(g["f_min"])
        assert t.f_max == pytest.approx(g["f_max"])
    p = golden_pairs[1]
    r = analyze_pair(p.baseline.trace, p.tests[0].trace, std, mode="A")
    assert [b.n for b in r.bands.values()] == g["band_counts"]


def test_reversed_leads(golden_pairs, expected, std):
    """Spec 4.3: the older files name terminals H1/X1/H0X0, the newer A/a/N; after aliasing,
    only the reversed leads listed in the expectations remain."""
    flagged = {}
    for stt, p in sorted(golden_pairs.items()):
        r = analyze_pair(p.baseline.trace, p.tests[0].trace, std)
        codes = sorted(w.code for w in r.warnings if w.code != "dlt911_step")
        if codes:
            flagged[stt] = codes
    assert flagged == {stt: ["reversed_leads"] for stt in expected["golden"]["reversed_leads"]}


def test_transformer_conclusion(golden_pairs, expected, std):
    results = [
        analyze_pair(p.baseline.trace, p.tests[0].trace, std, index=stt, label=p.key[1])
        for stt, p in sorted(golden_pairs.items())
    ]
    c = transformer_conclusion(results, std)
    assert c.worst.id == "normal"
    assert c.text == expected["golden"]["conclusion_text"]
