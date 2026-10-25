"""Pair baseline and test files (spec 4.4).

Key = STT + measurement label from the file name (STT 4 and 10 are both A-N but differ in
configuration). The traceName inside the file is not used (older files say H1-X1, newer ones A-a).
Transformers are identified by Serial Number; the oldest session is the default baseline.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

from ..parsers.base import FileNameInfo, Trace, parse_filename


@dataclass
class MeasurementFile:
    info: FileNameInfo
    trace: Trace

    @property
    def session_date(self) -> date:
        return self.info.timestamp.date()


@dataclass
class Pair:
    key: tuple[int, str]
    baseline: MeasurementFile
    tests: list[MeasurementFile]


@dataclass
class TransformerGroup:
    serial_number: str
    locations: list[str]
    session_dates: list[date]
    baseline_date: date
    pairs: list[Pair] = field(default_factory=list)
    unpaired: list[MeasurementFile] = field(default_factory=list)


@dataclass
class PairingResult:
    groups: list[TransformerGroup]
    unrecognized: list[str]             # files whose name does not follow STT_PhepDo_date_time


def pair_files(
    traces: list[Trace], baseline_dates: dict[str, date] | None = None
) -> PairingResult:
    by_serial: dict[str, list[MeasurementFile]] = defaultdict(list)
    unrecognized: list[str] = []
    for t in traces:
        info = parse_filename(t.source_name)
        if info is None:
            unrecognized.append(t.source_name)
            continue
        by_serial[t.serial_number or "(không rõ số chế tạo)"].append(MeasurementFile(info, t))

    groups: list[TransformerGroup] = []
    for serial, files in sorted(by_serial.items()):
        dates = sorted({f.session_date for f in files})
        base = (baseline_dates or {}).get(serial, dates[0])
        by_key: dict[tuple[int, str], list[MeasurementFile]] = defaultdict(list)
        for f in files:
            by_key[f.info.key].append(f)
        g = TransformerGroup(
            serial_number=serial,
            locations=sorted({f.trace.location for f in files if f.trace.location}),
            session_dates=dates,
            baseline_date=base,
        )
        for key in sorted(by_key):
            items = sorted(by_key[key], key=lambda f: f.info.timestamp)
            bases = [f for f in items if f.session_date == base]
            if not bases:
                g.unpaired.extend(items)
                continue
            # Several files of the same key on the baseline day: the latest is the baseline.
            baseline = bases[-1]
            tests = [f for f in items if f.session_date != base]
            g.unpaired.extend(bases[:-1])
            if tests:
                g.pairs.append(Pair(key, baseline, tests))
            else:
                g.unpaired.append(baseline)
        groups.append(g)
    return PairingResult(groups=groups, unrecognized=unrecognized)
