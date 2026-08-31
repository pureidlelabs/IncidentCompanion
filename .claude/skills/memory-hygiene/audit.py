#!/usr/bin/env python3
"""Ask the repository which claims in the memory directory are still true.

Memory is written by a session that had the answer in front of it and read
by one that does not, so a wrong memory outranks the code it contradicts --
which is the whole reason to check the cheap half mechanically. Five of the
seven checks are questions with a yes/no answer (does the file exist, does
the commit resolve, is it in the index); STALE and OVERLAP only nominate
candidates and are never a verdict.

Exit status is 1 when a gating check fires. STALE and OVERLAP never gate:
a memory nobody has touched in a year may be the most valuable one there.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys
import time

GATING = ("INDEX", "FRONT", "PATH", "COMMIT")
# LINK is advisory because a dangling `[[name]]` is legal: the memory
# instructions call it a marker for a memory worth writing later.
ADVISORY = ("LINK", "STALE", "OVERLAP")
TYPES = {"user", "feedback", "project", "reference"}

# A path claim worth checking names one of the repo's own trees. Backticked
# prose is full of `case.json`, `--app-dir` and `AppState.mutate`; a leading
# directory is what separates a path from a filename someone mentioned.
PATH_RE = re.compile(
    r"`((?:app|tests|scripts|docs|tools|\.claude|\.github)/[\w./*-]+)`"
)
COMMIT_RE = re.compile(r"`([0-9a-f]{7,40})`")
LINK_RE = re.compile(r"\[\[([\w-]+)\]\]")
INDEX_RE = re.compile(r"\]\(([\w-]+\.md)\)")
STOPWORDS = set(
    "the a an and or but of to in on for with is are was were it its this that "
    "as at by from not no be been has have had than then so if when what which "
    "one two three per not only also into over under after before while".split()
)


def memory_dir(repo: pathlib.Path) -> pathlib.Path:
    """The store for this repository, which a worktree shares with its checkout.

    **The slug is the main checkout's path, never the worktree's.** Slugging the
    directory you are standing in resolves to a project that has no store, and
    the audit then reports a clean run over nothing -- the empty-set shape,
    arriving as a pass.
    """
    import subprocess

    root = repo.resolve()
    try:
        common = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=root, capture_output=True, text=True, timeout=5,
        )
        if not common.returncode:
            root = pathlib.Path(common.stdout.strip()).parent
    except (OSError, subprocess.SubprocessError):
        pass
    slug = str(root).replace("/", "-")
    return pathlib.Path.home() / ".claude" / "projects" / slug / "memory"


def frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not match:
        return {}
    return dict(re.findall(r"^\s*([a-z_]+): (.+)$", match.group(1), re.M))


def body(text: str) -> str:
    return re.sub(r"^---\n.*?\n---\n", "", text, count=1, flags=re.S)


def terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z][a-z-]{3,}", text.lower()) if w not in STOPWORDS}


def check(memory: pathlib.Path, repo: pathlib.Path, stale_days: int) -> list[tuple[str, str, str]]:
    files = sorted(p for p in memory.glob("*.md") if p.name != "MEMORY.md")
    # An empty sweep passes every loop below and reads as a clean memory dir.
    # `docstring-freshness` and the plugin-name test both shipped that shape.
    if not files:
        sys.exit(f"{memory}: no memory files found; the path or the glob has gone stale")

    found: list[tuple[str, str, str]] = []
    stems = {p.stem for p in files}
    index = memory / "MEMORY.md"
    index_text = index.read_text() if index.exists() else ""
    indexed = set(INDEX_RE.findall(index_text))

    if not index.exists():
        found.append(("INDEX", str(memory), "no MEMORY.md; nothing is loaded at startup"))
    for name in sorted(indexed):
        if not (memory / name).exists():
            found.append(("INDEX", f"{index}", f"points at {name}, which does not exist"))
    for path in files:
        if path.name not in indexed:
            found.append(("INDEX", str(path), "not in MEMORY.md, so no session will recall it"))

    known_commits: dict[str, bool] = {}
    now = time.time()

    for path in files:
        text = path.read_text()
        front, prose = frontmatter(text), body(text)

        if not front:
            found.append(("FRONT", str(path), "no frontmatter"))
        else:
            if front.get("name") != path.stem:
                found.append(("FRONT", str(path), f"declares name {front.get('name')!r}"))
            if not front.get("description"):
                found.append(("FRONT", str(path), "no description, so recall cannot rank it"))
            kind = front.get("type")
            if kind and kind not in TYPES:
                found.append(("FRONT", str(path), f"type {kind!r} is not one of {sorted(TYPES)}"))

        for target in sorted(set(LINK_RE.findall(prose))):
            if target not in stems:
                found.append(("LINK", str(path), f"[[{target}]] resolves to nothing"))

        for claim in sorted(set(PATH_RE.findall(prose))):
            if "*" in claim:
                if not list(repo.glob(claim)):
                    found.append(("PATH", str(path), f"{claim} matches nothing"))
            elif not (repo / claim).exists():
                found.append(("PATH", str(path), f"{claim} does not exist"))

        for sha in sorted(set(COMMIT_RE.findall(prose))):
            if sha not in known_commits:
                known_commits[sha] = subprocess.run(
                    ["git", "-C", str(repo), "cat-file", "-e", f"{sha}^{{commit}}"],
                    capture_output=True,
                ).returncode == 0
            if not known_commits[sha]:
                found.append(("COMMIT", str(path), f"{sha} is not a commit in this repo"))

        age = (now - path.stat().st_mtime) / 86400
        if age > stale_days:
            found.append(("STALE", str(path), f"untouched for {age:.0f} days -- re-read it"))

    vocab = {p.stem: terms(body(p.read_text())) for p in files}
    for i, a in enumerate(files):
        for b in files[i + 1:]:
            shared = vocab[a.stem] & vocab[b.stem]
            smaller = min(len(vocab[a.stem]), len(vocab[b.stem])) or 1
            if len(shared) / smaller > 0.5:
                found.append(
                    ("OVERLAP", str(a), f"shares {len(shared)} terms with {b.stem} -- one fact or two?")
                )
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo", nargs="?", default=".", type=pathlib.Path)
    parser.add_argument("--memory-dir", type=pathlib.Path)
    parser.add_argument("--only", action="append", metavar="CHECK")
    parser.add_argument("--stale-days", type=int, default=90)
    parser.add_argument("--quiet", action="store_true", help="counts only")
    args = parser.parse_args()

    repo = args.repo.resolve()
    memory = (args.memory_dir or memory_dir(repo)).expanduser()
    if not memory.is_dir():
        sys.exit(f"{memory}: not a directory")

    found = check(memory, repo, args.stale_days)
    wanted = [c.upper() for c in args.only] if args.only else list(GATING + ADVISORY)
    found = [f for f in found if f[0] in wanted]

    counts: dict[str, int] = {}
    for kind, where, message in found:
        counts[kind] = counts.get(kind, 0) + 1
        if not args.quiet:
            print(f"{kind:8} {pathlib.Path(where).name:38} {message}")

    print(f"\n{memory}", file=sys.stderr)
    for kind in GATING + ADVISORY:
        if kind in wanted:
            print(f"  {kind:8} {counts.get(kind, 0)}", file=sys.stderr)

    return 1 if any(counts.get(k) for k in GATING) else 0


if __name__ == "__main__":
    raise SystemExit(main())
