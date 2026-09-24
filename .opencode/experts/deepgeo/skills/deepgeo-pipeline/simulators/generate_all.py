from __future__ import annotations

import argparse
from pathlib import Path

from .scenic_park import generate as generate_park
from .xr_cinema import generate as generate_xr


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 DeepGeo 两个版本化模拟案例集")
    parser.add_argument("--output", type=Path, default=Path("../cases"))
    parser.add_argument("--fixtures", type=Path, default=Path("tests/fixtures/cases"))
    parser.add_argument("--seed", type=int, default=20260909)
    args = parser.parse_args()
    xr = generate_xr(args.output, args.seed, args.fixtures)
    park = generate_park(args.output, args.seed, args.fixtures)
    print(f"xr-cinema files={len(xr['files'])} rows={sum(item['rows'] for item in xr['files'])}")
    print(f"scenic-park files={len(park['files'])} rows={sum(item['rows'] for item in park['files'])}")


if __name__ == "__main__":
    main()
