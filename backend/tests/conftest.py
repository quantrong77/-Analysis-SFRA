"""Test data lives OUTSIDE the repository (device information is never committed):
measurement files in tests/golden, $SFRA_GOLDEN_DIR or <project>/data/csv, and the expected
values in $SFRA_EXPECTED or <project>/data/golden_expected.json. Tests skip when absent."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from app.config import load_standards
from app.core.pairing import pair_files
from app.parsers import parse_file

HERE = Path(__file__).parent
PROJECT = HERE.parents[2]


def golden_dir() -> Path:
    candidates = [HERE / "golden"]
    if os.environ.get("SFRA_GOLDEN_DIR"):
        candidates.append(Path(os.environ["SFRA_GOLDEN_DIR"]))
    candidates.append(PROJECT / "data" / "csv")
    for c in candidates:
        if c.is_dir() and any(c.glob("[0-9]*.csv")):
            return c
    pytest.skip("Không có dữ liệu đo kiểm thử (ngoài repository)")


def expected_path() -> Path:
    return Path(os.environ.get("SFRA_EXPECTED", PROJECT / "data" / "golden_expected.json"))


@pytest.fixture(scope="session")
def expected() -> dict:
    p = expected_path()
    if not p.is_file():
        pytest.skip("Không có file giá trị kỳ vọng (ngoài repository)")
    return json.loads(p.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def std():
    return load_standards()


@pytest.fixture(scope="session")
def golden_traces():
    # files following STT_PhepDo_date_time; other files in the folder are not part of the golden set
    return [parse_file(p) for p in sorted(golden_dir().glob("[0-9]*.csv"))]


@pytest.fixture(scope="session")
def golden_pairs(golden_traces):
    result = pair_files(golden_traces)
    assert len(result.groups) == 1, "bộ dữ liệu kiểm thử thuộc cùng một MBA (Serial Number)"
    return {p.key[0]: p for p in result.groups[0].pairs}
