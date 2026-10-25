"""Load the ruleset (standards.yaml): every threshold, band and template lives there."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

DEFAULT_PATH = Path(__file__).with_name("standards.yaml")


@dataclass(frozen=True)
class Standards:
    data: dict[str, Any]
    path: Path
    sha256: str

    @property
    def version(self) -> str:
        return str(self.data["ruleset"]["version"])

    @property
    def version_tag(self) -> str:
        """Version string stored with every result: '<version>+<sha256[:12]>'."""
        return f"{self.version}+{self.sha256[:12]}"

    def __getitem__(self, key: str) -> Any:
        return self.data[key]


def load_standards(path: str | Path | None = None) -> Standards:
    p = Path(path) if path else DEFAULT_PATH
    raw = p.read_bytes()
    data = yaml.safe_load(raw.decode("utf-8"))
    return Standards(data=data, path=p, sha256=hashlib.sha256(raw).hexdigest())
