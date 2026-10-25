"""Parser for the "[FRA Data v2.0]" CSV format (spec 4.1)."""
from __future__ import annotations

import csv
import math
import re
from datetime import datetime

import numpy as np

from .base import (
    ParseError,
    Section,
    TestSetting,
    Trace,
    clean_arrays,
    decode_bytes,
    parse_filename,
    sha256_hex,
)

HEADER = "[FRA Data v2.0]"
_SECTION_RE = re.compile(r"^\[(?P<inner>.+)\]$")
_ATTR_RE = re.compile(r"\s+\w+\s*=\s*\"[^\"]*\"")

# testSetting key -> TestSetting field
_SETTING_KEYS = {
    "redLead": "red_lead",
    "blackLead": "black_lead",
    "measurementType": "measurement_type",
    "shortedTerminal": "shorted_terminal",
    "groundedTerminal": "grounded_terminal",
    "ltcPosition": "ltc_position",
    "detcPosition": "detc_position",
}


def _detect_delimiter(first_line: str) -> str:
    rest = first_line.strip().lstrip("﻿")[len(HEADER):]
    for d in (",", ";", "\t"):
        if rest.startswith(d):
            return d
    return ","


def _to_float(cell: str, decimal_comma: bool) -> float | None:
    s = cell.strip()
    if not s:
        return None
    if decimal_comma:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _section_name(inner: str) -> str:
    return _ATTR_RE.sub("", inner).strip()


class FraV2CsvParser:
    format_id = "fra_v2_csv"

    def sniff(self, content: bytes, filename: str) -> bool:
        try:
            head, _ = decode_bytes(content[:256])
        except ParseError:
            return False
        return head.lstrip("﻿").lstrip().startswith(HEADER)

    def parse(self, content: bytes, filename: str) -> Trace:
        text, encoding = decode_bytes(content)
        lines = text.splitlines()
        if not lines or not lines[0].lstrip("﻿").strip().startswith(HEADER):
            raise ParseError(f"Không phải định dạng {HEADER}")
        delim = _detect_delimiter(lines[0])
        decimal_comma = delim != ","
        rows = list(csv.reader(lines, delimiter=delim))

        # Column header row: first row whose first cell ends with "freq"
        hdr_idx = next(
            (i for i, r in enumerate(rows[:20]) if r and r[0].strip().lower().endswith("freq")),
            None,
        )
        if hdr_idx is None:
            raise ParseError("Không tìm thấy dòng tiêu đề cột (… freq, … RMS, … Peaks, … Phase)")
        header = [c.strip() for c in rows[hdr_idx]]
        cols = self._columns(header)
        trace_name = header[0][: -len("freq")].strip()

        # Data: from the row after the header, stop at the first non-numeric row (no row limit).
        freq, rms, peaks, phase = [], [], [], []
        i = hdr_idx + 1
        while i < len(rows):
            r = rows[i]
            f = _to_float(r[cols["freq"]], decimal_comma) if len(r) > cols["freq"] else None
            if f is None or not math.isfinite(f):
                break
            vals = [
                _to_float(r[c], decimal_comma) if c is not None and len(r) > c else None
                for c in (cols["rms"], cols["peaks"], cols["phase"])
            ]
            freq.append(f)
            rms.append(math.nan if vals[0] is None else vals[0])
            peaks.append(math.nan if vals[1] is None else vals[1])
            phase.append(math.nan if vals[2] is None else vals[2])
            i += 1
        if len(freq) < 2:
            raise ParseError("File không có dữ liệu đo (ít hơn 2 điểm)")

        sections = [Section("_preamble", self._pairs(rows[1:hdr_idx], delim))]
        sections += self._sections(rows[i:], delim)

        f_arr, m_arr, p_arr, pk_arr = clean_arrays(
            np.asarray(freq, float), np.asarray(rms, float), np.asarray(phase, float), np.asarray(peaks, float)
        )
        if pk_arr is not None and not np.isfinite(pk_arr).any():
            pk_arr = None

        trace = Trace(
            freq=f_arr,
            mag_db=m_arr,
            phase_deg=p_arr,
            peaks_db=pk_arr,
            trace_name=trace_name,
            source_name=filename,
            sha256=sha256_hex(content),
            format_id=self.format_id,
            sections=sections,
            encoding=encoding,
        )
        self._fill_identity(trace, filename)
        return trace

    @staticmethod
    def _columns(header: list[str]) -> dict[str, int | None]:
        def find(suffix: str) -> int | None:
            for idx, name in enumerate(header):
                if name.lower().endswith(suffix):
                    return idx
            return None

        cols = {"freq": find("freq"), "rms": find("rms"), "peaks": find("peaks"), "phase": find("phase")}
        if cols["rms"] is None or cols["phase"] is None:
            raise ParseError("Thiếu cột RMS hoặc Phase trong dòng tiêu đề")
        return cols

    @staticmethod
    def _pairs(rows: list[list[str]], delim: str) -> dict[str, str]:
        """Preamble row 'temp,NaN,RH,NaN' -> {'temp': 'NaN', 'RH': 'NaN'}."""
        items: dict[str, str] = {}
        for r in rows:
            cells = [c.strip() for c in r]
            for k in range(0, len(cells) - 1, 2):
                if cells[k]:
                    items[cells[k]] = cells[k + 1]
        return items

    @staticmethod
    def _sections(rows: list[list[str]], delim: str) -> list[Section]:
        """Read the trailing key,value metadata block-by-block, never overwriting across sections."""
        sections: list[Section] = []
        current: Section | None = None
        for r in rows:
            cells = [c.strip() for c in r]
            if not any(cells):
                continue
            m = _SECTION_RE.match(cells[0])
            if m:
                current = Section(_section_name(m["inner"]))
                sections.append(current)
                continue
            if current is None:
                current = Section("_orphan")
                sections.append(current)
            key = cells[0]
            value = delim.join(cells[1:]).rstrip(delim).strip()
            if key in current.items:
                n = 2
                while f"{key}#{n}" in current.items:
                    n += 1
                key = f"{key}#{n}"
            current.items[key] = value
        return sections

    @staticmethod
    def _fill_identity(trace: Trace, filename: str) -> None:
        nameplate = next(
            (s for s in trace.sections if s.name.startswith("nameplate") and s.name != "nameplate end"),
            None,
        )
        np_items = nameplate.items if nameplate else {}

        setting = trace.section("testSetting")
        setup = trace.section("testSetup")
        ts = TestSetting()
        if setting:
            for key, attr in _SETTING_KEYS.items():
                setattr(ts, attr, setting.items.get(key, "").strip())
        if not ts.measurement_type and setup:
            ts.measurement_type = setup.items.get("measurementType", "").strip()
        trace.setting = ts

        trace.serial_number = (
            np_items.get("Serial Number", "").strip()
            or trace.meta("transformerNameplate", "serialNumber").strip()
        )
        trace.location = np_items.get("Location", "").strip() or trace.meta("apparatusLocation", "location").strip()

        dt = None
        if setup and setup.items.get("timestamp"):
            dt = _parse_dt(setup.items["timestamp"])
        if dt is None and np_items.get("Test Date"):
            dt = _parse_dt(f"{np_items['Test Date']} {np_items.get('Test Time', '')}".strip())
        if dt is None:
            info = parse_filename(filename)
            dt = info.timestamp if info else None
        trace.test_datetime = dt


def _parse_dt(s: str) -> datetime | None:
    s = s.strip()
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None
