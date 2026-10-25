"""FRA v2.0 parser: blank lines, trailing metadata, ';' delimiter, decimal comma (spec 4.1, 9)."""
from __future__ import annotations

import pytest

from app.parsers import parse_bytes, parse_filename
from app.parsers.base import ParseError

SAMPLE = """[FRA Data v2.0],,,
temp,NaN,RH,NaN
A-a_2026 freq,A-a_2026 RMS,A-a_2026 Peaks,A-a_2026 Phase
20.5,-30.1,-30.0,-80.0
1000,-35.2,-35.1,-60.5
1000,-99,-99,-99
500000,-40.0,-40.0,10.25
,,,
,,,

[nameplate OutPutFileName.csv]
Location,TRAM MAU
Serial Number,SN-0001
Test Date,02/01/2020
Test Time,11:38
Notes,ghi chu nameplate
[nameplate end]
[apparatusLocation  version="1"]
location,TRAM MAU
notes,GHI CHU MAU
[testSetup version="2"]
traceName,A-a_2026
timestamp,02/01/2020 03:04:05
measurementType,OpenCircuit
notes,
[testSetting version="1"]
redLead,Y2
blackLead,Y1
ltcPosition,neutral
detcPosition,as found
shortedTerminal,none
groundedTerminal,none
measurementType,OpenCircuit
"""


def _semicolon_decimal_comma(text: str) -> str:
    out = []
    for line in text.splitlines():
        cells = line.split(",")
        out.append(";".join(cells))
    s = "\n".join(out)
    # numbers in the data block use a decimal comma
    return (
        s.replace("20.5;", "20,5;").replace("-30.1;-30.0;-80.0", "-30,1;-30,0;-80,0")
        .replace("-35.2;-35.1;-60.5", "-35,2;-35,1;-60,5").replace("-40.0;-40.0;10.25", "-40,0;-40,0;10,25")
    )


def _check(t):
    assert t.n_points == 3                     # duplicate frequency 1000 Hz dropped (first kept)
    assert t.freq.tolist() == [20.5, 1000.0, 500000.0]
    assert t.mag_db.tolist() == [-30.1, -35.2, -40.0]
    assert t.phase_deg.tolist() == [-80.0, -60.5, 10.25]
    assert t.peaks_db.tolist() == [-30.0, -35.1, -40.0]
    assert t.trace_name == "A-a_2026"
    assert t.serial_number == "SN-0001"
    assert t.location == "TRAM MAU"
    assert t.test_datetime.isoformat() == "2020-01-02T03:04:05"
    assert t.setting.red_lead == "Y2" and t.setting.black_lead == "Y1"
    assert t.setting.measurement_type == "OpenCircuit"
    # 'notes' repeats in several sections: read per section, never overwritten
    assert t.meta("apparatusLocation", "notes") == "GHI CHU MAU"
    assert t.meta("nameplate OutPutFileName.csv", "Notes") == "ghi chu nameplate"
    assert t.meta("testSetup", "notes") == ""


def test_comma_file_with_blank_lines_and_metadata():
    _check(parse_bytes(SAMPLE.encode("utf-8"), "1_A-a_2020-01-02_03-04-05.csv"))


def test_utf8_bom():
    _check(parse_bytes(b"\xef\xbb\xbf" + SAMPLE.encode("utf-8"), "x.csv"))


def test_semicolon_and_decimal_comma():
    _check(parse_bytes(_semicolon_decimal_comma(SAMPLE).encode("utf-8"), "x.csv"))


def test_cp1258_fallback():
    text = SAMPLE.replace("ghi chu nameplate", "ghi chú")
    t = parse_bytes(text.encode("cp1258"), "x.csv")
    assert t.encoding in ("cp1258", "cp1252")
    assert t.n_points == 3


def test_no_row_limit():
    rows = "\n".join(f"{20 * 1.001 ** k:.6f},-30,-30,0" for k in range(3000))
    head = "[FRA Data v2.0],,,\ntemp,NaN,RH,NaN\nT freq,T RMS,T Peaks,T Phase\n"
    t = parse_bytes((head + rows + "\n,,,\n").encode(), "x.csv")
    assert t.n_points == 3000


def test_not_fra_format():
    with pytest.raises(ParseError):
        parse_bytes(b"freq;mag;phase\n1;2;3\n", "x.csv")


def test_filename_key():
    info = parse_filename("10_A-N_2020-01-02_03-04-05.csv")
    assert info.key == (10, "A-N")
    assert info.timestamp.isoformat() == "2020-01-02T03:04:05"
    assert parse_filename("16_Y1-Y2_2021-02-03_04-05-06_0.sfra").key == (16, "Y1-Y2")
    assert parse_filename("random.csv") is None


def test_golden_metadata(golden_traces, golden_pairs, expected):
    g = expected["golden"]
    p = golden_pairs[1]
    old, new = p.baseline.trace, p.tests[0].trace
    # traceName differs between sessions, which is why it is not used for pairing
    assert old.trace_name.startswith(g["old_trace_name_prefix"])
    assert new.trace_name.startswith(g["new_trace_name_prefix"])
    assert {t.serial_number for t in golden_traces} == {g["serial"]}
