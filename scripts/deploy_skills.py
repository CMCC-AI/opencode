#!/usr/bin/env python3
"""Deploy repo skills to the user's global skills directory.

Collects skills from two sources:
  1. .opencode/skills/*            (repo-level skills)
  2. .opencode/experts/*/skills/*  (expert-team skills bundled in this repo;
     not visible to conversations on their own, so deploy them globally)

Usage (from the opencode repo root):
  python3 scripts/deploy_skills.py            # deploy all skills
  python3 scripts/deploy_skills.py --list     # show what would be deployed

Target: $XDG_CONFIG_HOME/opencode/skills (default ~/.config/opencode/skills) —
the always-scanned global location, so CMCC conversations under
~/Documents/DeepInsight can load these skills.
"""
import argparse
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / ".opencode"
SOURCES = [
    ROOT / "skills",
    ROOT / "experts",
]
# Mirror xdg-basedir (what opencode uses): XDG_CONFIG_HOME when set, else ~/.config.
CONFIG_HOME = Path(os.environ["XDG_CONFIG_HOME"]) if os.environ.get("XDG_CONFIG_HOME") else Path.home() / ".config"
DST = CONFIG_HOME / "opencode" / "skills"


def collect():
    found = {}
    for src in SOURCES:
        if not src.is_dir():
            continue
        if src.name == "experts":
            candidates = sorted(src.glob("*/skills/*"))
        else:
            candidates = sorted(p for p in src.iterdir() if p.is_dir())
        for skill in candidates:
            if not skill.is_dir() or not (skill / "SKILL.md").is_file():
                continue
            prior = found.get(skill.name)
            if prior and prior != skill:
                sys.exit(f"skill name conflict: {skill.name} exists at {prior} and {skill}")
            found[skill.name] = skill
    return found


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="list skills without copying")
    args = parser.parse_args()

    skills = collect()
    if not skills:
        sys.exit(f"no skills (missing SKILL.md) under {ROOT}")

    for name, skill in sorted(skills.items()):
        target = DST / name
        if args.list:
            print(f"would deploy {name}: {skill} -> {target}")
            continue
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(skill, target)
        print(f"deployed {name} -> {target}")


if __name__ == "__main__":
    main()
