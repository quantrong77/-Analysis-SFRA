"""Parser registry: pick the first parser whose sniff() accepts the file."""
from __future__ import annotations

from pathlib import Path

from .base import FileNameInfo, ParseError, Trace, parse_filename
from .fra_v2_csv import FraV2CsvParser

PARSERS = [FraV2CsvParser()]


def parse_bytes(content: bytes, filename: str) -> Trace:
    for parser in PARSERS:
        if parser.sniff(content, filename):
            return parser.parse(content, filename)
    raise ParseError(f"Không nhận dạng được định dạng file: {filename}")


def parse_file(path: str | Path) -> Trace:
    p = Path(path)
    return parse_bytes(p.read_bytes(), p.name)


__all__ = ["FileNameInfo", "ParseError", "Trace", "parse_bytes", "parse_file", "parse_filename"]
