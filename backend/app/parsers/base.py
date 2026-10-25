"""Common data model for all parsers: every file format is converted into a Trace."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

import numpy as np

# STT_PhepDo_YYYY-MM-DD_HH-MM-SS[_n].csv|sfra, e.g. 1_A-a_2020-01-02_03-04-05.csv
FILENAME_RE = re.compile(
    r"^(?P<index>\d+)_(?P<label>.+?)_(?P<date>\d{4}-\d{2}-\d{2})_(?P<time>\d{2}-\d{2}-\d{2})"
    r"(?:_\d+)?\.(?P<ext>csv|sfra)$",
    re.IGNORECASE,
)

ENCODINGS = ("utf-8-sig", "utf-8", "cp1258", "cp1252")


@dataclass(frozen=True)
class FileNameInfo:
    index: int
    label: str
    timestamp: datetime

    @property
    def key(self) -> tuple[int, str]:
        """Pairing key = STT + measurement label (spec 4.4)."""
        return (self.index, self.label)


def parse_filename(name: str) -> FileNameInfo | None:
    m = FILENAME_RE.match(name.replace("\\", "/").rsplit("/", 1)[-1])
    if not m:
        return None
    ts = datetime.strptime(f"{m['date']} {m['time']}", "%Y-%m-%d %H-%M-%S")
    return FileNameInfo(index=int(m["index"]), label=m["label"], timestamp=ts)


@dataclass
class TestSetting:
    __test__ = False  # not a pytest test class

    red_lead: str = ""
    black_lead: str = ""
    measurement_type: str = ""
    shorted_terminal: str = ""
    grounded_terminal: str = ""
    ltc_position: str = ""
    detc_position: str = ""


@dataclass
class Section:
    name: str
    items: dict[str, str] = field(default_factory=dict)


@dataclass
class Trace:
    freq: np.ndarray
    mag_db: np.ndarray
    phase_deg: np.ndarray
    peaks_db: np.ndarray | None = None
    trace_name: str = ""
    source_name: str = ""
    sha256: str = ""
    format_id: str = ""
    sections: list[Section] = field(default_factory=list)
    setting: TestSetting = field(default_factory=TestSetting)
    serial_number: str = ""
    location: str = ""
    test_datetime: datetime | None = None
    encoding: str = ""

    @property
    def n_points(self) -> int:
        return int(self.freq.size)

    @property
    def f_min(self) -> float:
        return float(self.freq[0])

    @property
    def f_max(self) -> float:
        return float(self.freq[-1])

    def section(self, name: str, occurrence: int = 0) -> Section | None:
        """Return the n-th section with this name (names repeat, e.g. tapChangerNameplate)."""
        found = [s for s in self.sections if s.name == name]
        return found[occurrence] if occurrence < len(found) else None

    def meta(self, section: str, key: str, default: str = "") -> str:
        s = self.section(section)
        return s.items.get(key, default) if s else default


class Parser(Protocol):
    format_id: str

    def sniff(self, content: bytes, filename: str) -> bool: ...

    def parse(self, content: bytes, filename: str) -> Trace: ...


class ParseError(ValueError):
    pass


def decode_bytes(content: bytes) -> tuple[str, str]:
    """Try UTF-8 with BOM, UTF-8, then cp1258/cp1252 (spec 4.1)."""
    for enc in ENCODINGS:
        try:
            return content.decode(enc), enc
        except UnicodeDecodeError:
            continue
    raise ParseError("Không giải mã được file (đã thử UTF-8-BOM, UTF-8, cp1258, cp1252)")


def sha256_hex(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def clean_arrays(
    freq: np.ndarray, mag: np.ndarray, phase: np.ndarray, peaks: np.ndarray | None
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray | None]:
    """Drop NaN / non-positive frequencies, sort ascending, drop duplicate frequencies (keep first)."""
    ok = np.isfinite(freq) & (freq > 0) & np.isfinite(mag) & np.isfinite(phase)
    freq, mag, phase = freq[ok], mag[ok], phase[ok]
    peaks = peaks[ok] if peaks is not None else None
    order = np.argsort(freq, kind="stable")
    freq, mag, phase = freq[order], mag[order], phase[order]
    peaks = peaks[order] if peaks is not None else None
    _, first = np.unique(freq, return_index=True)
    return freq[first], mag[first], phase[first], (peaks[first] if peaks is not None else None)
