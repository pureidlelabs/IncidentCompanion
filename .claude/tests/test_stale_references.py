# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""A backticked path that names no file is a pointer into a tier that is gone.

A docstring saying "the rendered side is asserted in
`tests/test_graph_route.py`" is worse than silence, because it reports
coverage that does not exist.

**Path-shaped only, which is what makes this checkable.** A path either
resolves against `git ls-files` or it does not. An identifier-shaped check has
no such property and is dominated by names it was never going to find.

**The allowlist asserts in both directions.** An exemption that becomes
resolvable again is a stale exemption, and a list that only ever grows is the
failure this test exists to prevent, one level up.
"""

from __future__ import annotations

import pathlib
import re
import subprocess

REPO = pathlib.Path(__file__).resolve().parents[2]

#: **Source only, and that is the whole design.** In a source file a citation
#: naming no file is unambiguously wrong -- it is a route a reader follows to
#: nothing. In a *note* it is frequently the subject: `traps-code` and
#: `traps-test-harness` exist to narrate incidents, and an incident about a
#: span cut out of `ui_kit.py` has to name `ui_kit.py`.
#:
#: Asserting over both would need a ~25-entry allowlist of narratives, which is
#: the dumping ground this file's own docstring warns about. Notes get the
#: report instead, where a judgement belongs; mechanics
#: get the test.
#: **`server` and `docker` were missing until 2026-08-16**, which is the
#: whole Node tier and every image file -- so a citation there could name a
#: deleted path and this guard reported clean. Proved by planting
#: `app/totally_invented_file.py` in `server/src/db/client.ts`: green.
#: The same string in `tests/` went red immediately.
#: **`app/` is not scanned, and `e2e/` is inside it now.** The retired corpus is
#: read to check what the Node rewrite replaced; it gains no features and takes
#: no maintenance, so requiring its internal citations to resolve is upkeep on a
#: tier that is going. `tests/` here is the live tree, filed by subject.
SCANNED = ("tests", "ui/src", "server/src", "server/test", "server/scripts",
           "server/e2e", "docker")
EXCLUDED = ()

#: A path, not an identifier: it carries a separator or a file extension this
#: repository actually uses.
REFERENCE = re.compile(
    # `[^.]` after each slash: `ui/.../figures.ts` is prose shorthand for a path
    # too long to write, not a claim that the file is there -- and widening the
    # scan to `server/` made three of them look like dead citations.
    r"`((?:app|ui|tests|e2e|docs|scripts|tools|server|docker)/(?:[\w-][\w./-]*)?"
    r"\.(?:py|ts|tsx|css|html|toml|sh|json|md|yml|sql|conf|inc|mts|mjs)"
    r"|[\w-]+\.(?:py|html))`")

#: The same shape, for the namespace guidance actually cites. Kept separate
#: from `REFERENCE` because source files do not write these spellings and the
#: source allowlist should not have to carry their exemptions.
#:
#: Reusing `REFERENCE`, which is rooted at `app|ui|tests|…`, leaves every
#: `.claude`-namespace citation invisible: a skill can point an agent at
#: `.claude/tests/test_never_existed.py` and the suite stays green. That is the
#: *likeliest* false citation in guidance, not a contrived one.
#:
#: `rules/`, `hooks/`, `skills/`, `scripts/` unprefixed too, since
#: guidance writes them relative to `.claude/`.
#: No `*` in the character class, so a **glob** is not read as a citation:
#: `rules/*.md` and `tests/test_container_*.py` are how guidance describes a
#: `paths` block, and they are patterns rather than routes a reader follows.
GUIDANCE_REFERENCE = re.compile(
    r"`((?:\.claude/)?(?:rules|hooks|skills|scripts|tests|"
    r"screenshot_scripts|worktrees|references)/[\w./-]+"
    r"\.(?:py|md|json|toml|sh|yml|jsonl))`")

#: A bare filename, which is **the commonest citation spelling in guidance** and
#: was invisible to both patterns above until it was counted: 119 of 265
#: file-shaped citations in the scanned surfaces, led by `CLAUDE.md`,
#: `MEMORY.md`, `INDEX.md`, `codebase-structure.md`, `intent.md`. `_resolves`
#: already matches a bare name against any directory, so this needs no path
#: handling -- only the extensions guidance actually writes.
BARE_REFERENCE = re.compile(r"`([\w][\w.-]*\.(?:md|sh|tsx|ts|json|yaml|yml))`")

#: A file directly under `.claude/` -- `intent.md`, `codebase-structure.md`.
#: No directory segment, so neither pattern above sees it.
CLAUDE_ROOT_REFERENCE = re.compile(r"`(\.claude/[\w.-]+\.(?:md|py|json|toml|sh|yml))`")

#: Exemptions, each with the reason it cannot resolve. A bare string would rot
#: into a dumping ground; the reason is what makes a reviewer ask whether it
#: still applies.
#: Three shapes a source file may legitimately name something absent: another
#: repository's file, a hypothetical the test exists to *prevent*, and a
#: tombstone whose whole point is that the thing is gone. Each entry says
#: which, because a bare list rots into a dumping ground.
ALLOWED = {
    "app/picker/shell.py": "ThreatLedger's, a read-only cross-repo reference",
    "tests/platform.py": "hypothetical -- the name test_platform_portability exists to refuse",
    "picker.py": "tombstone: it became app/picker/, which is why discovery is dynamic",
}

#: **Real at run time and never tracked**, which is the one shape this check
#: cannot distinguish from rot: it resolves against `git ls-files`, so a name
#: that is only ever served can never resolve in any checkout. The alternative,
#: teaching `_resolves` to accept ignored paths, would let a genuinely dead
#: citation through whenever it happened to sit under an ignore rule.
#:
#: **Held apart from `ALLOWED` because these can never retire**, and
#: `test_every_allowed_reference_still_needs_its_exemption` asks exactly that
#: question. Kept in one dict, every entry here would be a permanent exception
#: to the both-directions claim, and the guard would be asserting something
#: weaker than it says. `ALLOWED`'s own comment called for this split at the
#: second entry rather than the tenth, which is when it arrived.
#:
#: **And respelling one is the trap, not the fix.** `index.html` on its own
#: resolves - against `ui/index.html`, the Vite *source template*, which is a
#: different file from the build output the docstring is measuring the age
#: of. That turns the check green by pointing the reader at the wrong
#: artefact, which is worse than either option that entry chose between.
UNTRACKED_BY_DESIGN = {
    "ui/dist/index.html": "a build output: real at run time, gitignored, so never tracked",
    # Storybook's own served route, not a file in this repository at any
    # commit. The three citations naming it are describing *where the probe
    # drives the browser*, which is the subject rather than a route a reader
    # follows -- and `frame-oracle.ts` names it while recording that
    # `storyFinished` resolves `success` even when `play`'s assertions failed.
    "iframe.html": "Storybook serves it; no checkout has ever held the file",
}

#: **Guidance an agent acts on, where a citation is a route rather than a
#: subject.** Measured before choosing these four: `rules/`, `agents/` and
#: `CLAUDE.md` carry **zero** unresolvable citations already, so the gate costs
#: nothing and only holds them there; `skills/` carried nine, every one of them
#: deliberate narrative rather than rot.
#:
#: **Notes are deliberately not here, and a sweep confirmed it rather than
#: assuming it.** Injected notes carried 40 unresolvable citations across 21
#: files. Reading every one: four described a mechanism that only ever existed
#: in the deleted Jinja tier and moved to `_retired/`; six were present-tense
#: instructions pointing at files that are gone, and were re-anchored. **The
#: remaining 22 across 11 notes are past-tense incident narratives** -- "nine
#: `test_compliance_section.py` failures in a change whose diff touched
#: `kit_html.py`" -- where the file being absent *is* the story. Gating those
#: needs the narrative allowlist this file's docstring refuses, and rewriting
#: them destroys the measurement they carry. Notes get
#: a report, where a judgement belongs.
SCANNED_GUIDANCE = (
    ".claude/rules", ".claude/CLAUDE.md", ".claude/skills")

#: **Installed by their own tooling and rewritten on an update**, so a citation
#: fixed here survives until the next version lands. `.claude/commands/` is all
#: vendored today, which is why the scope above does not name it. Same exemption
#: `.vale.ini` and `test_skills.py` give them.
VENDORED_GUIDANCE = (".claude/skills/openspec-", ".claude/commands/")

#: A skill whose *subject* is stale citations has to quote stale paths, so it
#: is exempted whole rather than by path -- six of the nine measured hits were
#: this one file, and listing them individually is the dumping ground again.
NARRATIVE_GUIDANCE = (".claude/skills/docstring-freshness/",)

#: The rest, each with the reason it cannot resolve.
ALLOWED_GUIDANCE = {
    "report.py": "an example filename in a note-similarity worked example",
    "tests/platform.py": "the same hypothetical the source allowlist names",
    "case.html": "a collision example from the Jinja tier, kept as the scenario",
    # Untracked *by design*, which is the whole subject of the skills citing
    # them -- the memory store is per-machine and CLAUDE.local.md is gitignored
    # so the repository can go public. `git ls-files` will never see either.
    "MEMORY.md": "the memory index, untracked per-machine state",
    "CLAUDE.local.md": "gitignored on purpose -- see its own first section",
    ".claude/CLAUDE.local.md": "the same file, written with its full path",
    ".claude/improvement-plan.md":
        "tombstone: memory-hygiene narrates this exact deletion as the "
        "incident that motivated it, so the citation is the subject",
}


def _tracked() -> tuple[set[str], set[str]]:
    """Every tracked path, and every directory implied by one."""
    files = set(subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, cwd=REPO,
    ).stdout.split())
    dirs = {str(p) for f in files for p in pathlib.PurePosixPath(f).parents}
    return files, dirs


def _resolves(ref: str, files: set[str], dirs: set[str]) -> bool:
    """Whether a citation names something in the tree.

    A bare filename resolves against any directory, because a docstring
    citing `conftest.py` from inside `tests/` is naming its neighbour rather
    than being imprecise.
    """
    if ref in files or ref in dirs:
        return True
    return "/" not in ref and any(f.endswith("/" + ref) for f in files)


def _citations():
    """(reference, "path:line") for every backticked path under SCANNED."""
    files, _ = _tracked()
    for name in sorted(files):
        if (not name.startswith(SCANNED) or name.startswith(EXCLUDED)
                or not name.endswith((".py", ".ts", ".tsx", ".md", ".sh"))):
            continue
        try:
            text = (REPO / name).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for n, line in enumerate(text.split("\n"), 1):
            for ref in REFERENCE.findall(line):
                yield ref, f"{name}:{n}"


def test_no_source_file_cites_a_path_that_does_not_exist():
    """The check that would have caught the port's whole wake in one run.

    Scoped to paths so it cannot be dismissed: every failure here is a
    citation a reader can follow to nothing.
    """
    files, dirs = _tracked()
    dead = [f"{ref:<40} {where}" for ref, where in _citations()
            if ref not in ALLOWED and ref not in UNTRACKED_BY_DESIGN
            and not _resolves(ref, files, dirs)]
    assert not dead, (
        "citations naming no file -- say what the claim is instead of "
        "pointing at what held it:\n" + "\n".join(sorted(dead)))


def _guidance_citations():
    """(reference, "path:line") for every backticked path in acted-on guidance."""
    files, _ = _tracked()
    for name in sorted(files):
        if (name.startswith(VENDORED_GUIDANCE)
                or not name.startswith(SCANNED_GUIDANCE)
                or name.startswith(NARRATIVE_GUIDANCE)
                or not name.endswith(".md")):
            continue
        try:
            text = (REPO / name).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for n, line in enumerate(text.split("\n"), 1):
            for pattern in (REFERENCE, GUIDANCE_REFERENCE, BARE_REFERENCE,
                            CLAUDE_ROOT_REFERENCE):
                for ref in pattern.findall(line):
                    yield ref, name, f"{name}:{n}"


def _resolves_guidance(ref: str, files: set[str], dirs: set[str],
                       citing: str = "") -> bool:
    """A guidance citation, which may be relative to `.claude/` or to its file.

    Three spellings are current and all three are legitimate, so all three
    resolve rather than one becoming a house style nobody enforces:

    - absolute from the repo root, `.claude/skills/ui-design/SKILL.md`;
    - relative to `.claude/`, `rules/git-workflow.md`;
    - **relative to the citing file's own directory**, which is how a skill
      names its own `references/state-lattice.md` -- eight such citations in
      `ui-design/SKILL.md` alone, every one of them correct.

    The third is why this takes `citing`: without it those eight read as dead,
    and the fix would have been an allowlist of live files.
    """
    if _resolves(ref, files, dirs) or _resolves(f".claude/{ref}", files, dirs):
        return True
    if citing:
        here = pathlib.PurePosixPath(citing).parent
        return _resolves(str(here / ref), files, dirs)
    return False


def test_the_guidance_scan_reads_something():
    """A scope that matches nothing passes every assertion under it.

    The source scan has this guard and the guidance one shipped without it: a
    directory rename or a typo in `SCANNED_GUIDANCE` turns the whole gate off
    and reports green. Measured -- pointing it at `.claude/NOPE` passed in
    0.42s.
    """
    files = [n for n in _tracked()[0]
             if n.startswith(SCANNED_GUIDANCE) and n.endswith(".md")
             and not n.startswith(VENDORED_GUIDANCE)]
    text = "\n".join((REPO / n).read_text(encoding="utf-8") for n in files)
    #: **Per pattern, not on the union.** `REFERENCE` alone contributes over a
    #: hundred, so a floor on the total stayed green while the
    #: `.claude`-namespace half -- the half this gate exists to add -- matched
    #: nothing at all. Measured: replacing `GUIDANCE_REFERENCE` with a pattern
    #: matching nothing, *and* planting a false `.claude/` citation, passed.
    for name, pattern, floor in (("REFERENCE", REFERENCE, 40),
                                 ("GUIDANCE_REFERENCE", GUIDANCE_REFERENCE, 20),
                                 ("BARE_REFERENCE", BARE_REFERENCE, 15)):
        found = pattern.findall(text)
        assert len(found) >= floor, (
            f"{name} matched {len(found)} citations in guidance, under its "
            f"floor of {floor} -- it or SCANNED_GUIDANCE stopped matching")


def test_no_guidance_file_cites_a_path_that_does_not_exist():
    """The hole a review found by planting one and watching the suite pass.

    A reviewer put a citation to a `tests/` file that has never existed into a
    skill and a note, alongside two other false claims, and **327 tests
    passed** -- nothing in either suite held a single claim in a guidance file.
    A skill is instruction an agent acts on, so a path in one is a route,
    and a route to nothing that *names a test* reports coverage that does not
    exist.

    Skills only among the four surfaces needed exemptions at all, and the
    other three were already clean when this was written -- so most of what
    this asserts is that they stay that way.
    """
    files, dirs = _tracked()
    dead = [f"{ref:<40} {where}" for ref, citing, where in _guidance_citations()
            if ref not in ALLOWED_GUIDANCE
            and not _resolves_guidance(ref, files, dirs, citing)]
    assert not dead, (
        "guidance citing a path that does not exist -- an agent follows these:\n"
        + "\n".join(sorted(dead)))


def test_every_allowed_guidance_reference_still_needs_its_exemption():
    """Same both-directions rule as the source allowlist, for the same reason."""
    files, dirs = _tracked()
    stale = [f"{ref} ({why})" for ref, why in ALLOWED_GUIDANCE.items()
             if _resolves_guidance(ref, files, dirs)]
    assert not stale, (
        "guidance allowlist entries that now resolve -- drop them:\n"
        + "\n".join(stale))


def test_the_narrative_exemption_names_a_skill_that_exists():
    """A whole-file exemption is the blunt one, so it may not outlive its file.

    Exempting by prefix hides every future citation in that directory too. If
    the skill is renamed or retired the exemption silently starts covering
    nothing -- or, worse, a path that happens to share the prefix.
    """
    for prefix in NARRATIVE_GUIDANCE:
        assert (REPO / prefix).is_dir(), (
            f"{prefix} is exempted as narrative but does not exist -- drop the "
            "exemption rather than leaving it to match something later")


def test_every_allowed_reference_still_needs_its_exemption():
    """An exemption that resolves again is one nobody removed.

    Without this the allowlist only grows, which is the same rot the test
    above exists to catch -- moved up a level and out of sight.

    **Asserts over `ALLOWED` alone**, which is what makes the claim true
    rather than nearly true: `UNTRACKED_BY_DESIGN` holds names no checkout can
    ever resolve, so every one of them would sit here permanently as an
    exception to a guard whose whole point is that exceptions expire.
    """
    files, dirs = _tracked()
    stale = [f"{ref} ({why})" for ref, why in ALLOWED.items()
             if _resolves(ref, files, dirs)]
    assert not stale, (
        "allowlist entries that now resolve -- drop them:\n" + "\n".join(stale))


def test_nothing_untracked_by_design_is_actually_in_the_tree():
    """The other direction, and the one that catches a misfiled entry.

    `UNTRACKED_BY_DESIGN` claims a name is served or built and never committed.
    If one resolves against `git ls-files`, that claim was wrong -- the file is
    right there, the citation was never exempt, and the entry is now hiding a
    live path from the scan above. It belongs in `ALLOWED` with a reason that
    expires, or nowhere.
    """
    files, dirs = _tracked()
    present = [f"{ref} ({why})" for ref, why in UNTRACKED_BY_DESIGN.items()
               if _resolves(ref, files, dirs)]
    assert not present, (
        "entries claimed untracked that the tree actually holds -- they are "
        "exemptions for a path that resolves:\n" + "\n".join(present))
