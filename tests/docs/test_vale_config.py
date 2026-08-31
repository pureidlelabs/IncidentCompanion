"""The prose linter's own config, asserted without needing the binary.

**A Vale section that matches nothing reports clean**, with no error and no
warning. The summary line counts files *walked*, not files *linted*, so a
section naming a tree that is not there prints the same "0 errors in 19 files"
as one covering every page -- and the only way to tell them apart is to plant a
violation and see whether it is caught.

Vale is a Go binary that CI does not carry, so these assert the two things that
can be checked from the config alone: that every section still selects real
files, and that every rule's tokens still match the thing the rule is named for.
Whether Vale *runs* clean is `npm run lint:prose` and is not asserted here.
"""

from __future__ import annotations

import json
import re
import shlex
import subprocess
from pathlib import Path

import pytest
import yaml
from tests._repo import REPO_ROOT

ROOT = REPO_ROOT
CONFIG = ROOT / ".vale.ini"
STYLES = ROOT / ".vale" / "styles"


def tracked_markdown() -> list[str]:
    """Every file Vale lints, which stopped being only markdown on 2026-08-16.

    `[formats]` maps other extensions to markdown so Vale reads their comments,
    so a section may legitimately name a tree that holds no `.md` at all.
    Keeping the name: what the sections select is still *pages* as far as every
    test here is concerned.

    **The extensions are read from `[formats]` rather than listed here.** A
    literal list drifts the moment one is added, and it drifts silently in the
    direction this file exists to refuse: the new section lints correctly and
    the guard that checks sections cannot see the files it selects, so it
    reports the section as dead.
    """
    # **Anchored to the line, because the file talks about itself.** A comment
    # above the section explains what `[formats]` does, so a plain string
    # search finds the sentence rather than the header and reads an empty
    # block -- which looks exactly like a config that maps nothing.
    block = re.search(r"^\[formats\]$(.*?)(?=^\[|\Z)", CONFIG.read_text(encoding="utf-8"), re.M | re.S)
    formats = re.findall(r"^(\w+)\s*=\s*md\s*$", block.group(1) if block else "", re.M)
    globs = ["*.md", *(f"*.{extension}" for extension in formats)]
    out = subprocess.run(
        ["git", "ls-files", *globs],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout
    return out.split()


def sections() -> list[str]:
    """The `[glob]` headers, in file order.

    **`[formats]` is not one.** It is Vale's extension-to-syntax table, so it
    selects no file and must not be asked to -- a test that demands it match
    something fails for the one header in the file that cannot.
    """
    headers = re.findall(r"^\[([^\]]+)\]", CONFIG.read_text(), re.M)
    return [h for h in headers if h != "formats"]


def vale_glob(pattern: str) -> re.Pattern[str]:
    """Vale's glob semantics, which are not the shell's.

    **`*` matches `/` too**, so `openspec/*.md` reaches
    `openspec/specs/cases/spec.md`. Probed 2026-08-16 by planting a violation at
    both depths: `*.md`, `**.md` and `**/*.md` all lint the root page and the
    nested one.
    The three forms are interchangeable here, so a section cannot be broken by
    choosing the wrong star -- only by naming a tree that is not there, which is
    what `test_every_section_selects_a_tracked_file` holds.

    Written out rather than delegated to `fnmatch`, which agrees about `*`
    crossing a separator - measured, `fnmatch('a/b', 'a*b')` is true - and
    disagrees about braces: `{a,b}` is a literal to it and alternation to Vale,
    so a section spelled that way would be judged against the wrong paths. An
    earlier version of this sentence said `fnmatch`'s `*` stops at a separator,
    which is `glob`'s rule rather than `fnmatch`'s.
    """
    out, i = [], 0
    while i < len(pattern):
        c = pattern[i]
        if c == "*":
            if pattern[i:i + 2] == "**":
                out.append(".*")
                i += 2
                continue
            out.append(".*")
        elif c == "?":
            out.append("[^/]")
        elif c == "{":
            end = pattern.index("}", i)
            alts = pattern[i + 1:end].split(",")
            out.append("(?:" + "|".join(re.escape(a) for a in alts) + ")")
            i = end + 1
            continue
        elif c == "[":
            end = pattern.index("]", i)
            out.append(pattern[i:end + 1])
            i = end + 1
            continue
        else:
            out.append(re.escape(c))
        i += 1
    return re.compile("^" + "".join(out) + "$")


@pytest.mark.parametrize("pattern", sections())
def test_every_section_selects_a_tracked_file(pattern: str) -> None:
    """A section matching nothing is the failure that reports success."""
    matcher = vale_glob(pattern)
    hits = [f for f in tracked_markdown() if matcher.match(f)]
    assert hits, (
        f"[{pattern}] in .vale.ini matches no tracked markdown file. "
        "Vale reports no error for this -- it simply lints nothing."
    )


def test_the_catch_all_section_reaches_a_nested_page() -> None:
    """Depth, which the section test above cannot distinguish.

    A glob naming a real tree but only its root would still pass
    `test_every_section_selects_a_tracked_file`, because a root `README.md`
    satisfies it. Most of the specifications are two levels down.
    """
    nested = [f for f in tracked_markdown()
              if f.startswith("openspec/") and f.count("/") >= 2]
    assert nested, "no nested specification to test the glob against"
    matcher = vale_glob("*.md")
    assert any(matcher.match(f) for f in nested), (
        "[*.md] reaches no page below openspec/, where the specifications live."
    )


def test_hard_wrap_is_on_for_markdown_and_off_for_source_comments() -> None:
    """The one structural rule here, and the only one whose scope must be split.

    `[formats]` maps `.ts`, `.tsx` and `.py` to markdown so Vale lints their
    comments. `HardWrap` is the rule that must not follow: a comment is read
    beside the code and wraps at the column the code does, so leaving it on
    reported 1,439 errors across the source trees -- measured 2026-08-29, the
    run that split it.
    """
    text = CONFIG.read_text()
    code = [h for h in sections()
            if any(e in h for e in (".ts", ".tsx", ".py")) and "*.md" not in h]
    assert code, ".vale.ini no longer lints source comments"
    for header in code:
        body = text.split(f"[{header}]", 1)[1].split("\n[", 1)[0]
        assert "Shared.HardWrap = NO" in body, (
            f"[{header}] lints comments as markdown with HardWrap still on. "
            "A wrapped comment is correct; only a wrapped .md file is not."
        )


def test_the_prescribed_command_exists_and_matches_the_config() -> None:
    """`rules/writing-style.md` tells a reader to run something. It has to be real.

    **This is the check that was missing.** The rule shipped saying
    `vale --config=.vale.ini …` while Vale existed only in one agent's scratch
    directory — a prescription that was true on one machine and false
    everywhere else, which is the exact failure `rules/claim-homes.md` names:
    *"a note that prescribes a command has made a claim about that command, and
    it can be false."*

    Asserted structurally rather than by running Vale, because CI has no Go
    binaries: the script must exist, the rule must name the script, and the
    devcontainer must install the tool the script invokes.
    """
    package = json.loads((ROOT / "package.json").read_text())
    script = package.get("scripts", {}).get("lint:prose")
    assert script, "package.json has no lint:prose script"
    assert "--config=.vale.ini" in script, f"lint:prose does not use this config: {script}"

    rule = (ROOT / ".claude" / "rules" / "writing-style.md").read_text()
    assert "npm run lint:prose" in rule, (
        "rules/writing-style.md no longer names the script that runs the linter"
    )

    # The devcontainer states its versions in `mise.toml`, and mise verifies
    # what it downloads -- a checksum, and an artifact attestation where the
    # publisher signs one. The claim is that the container provides the tool,
    # not the mechanism by which it arrives.
    tools = (ROOT / ".devcontainer" / "mise.toml").read_text()
    assert re.search(r"^vale\s*=", tools, re.M), (
        "the devcontainer no longer provides Vale, so `npm run lint:prose` "
        "would fail for anyone who did not install it by hand"
    )


#: `lint:prose` as written in `package.json`, which is the command the rule,
#: `verify.sh` and `test_scope.py` all name.
LINT_PROSE = json.loads((ROOT / "package.json").read_text())["scripts"]["lint:prose"]


def test_the_lint_does_not_read_a_worktree() -> None:
    """**A worktree clones `.claude/` whole, so every page gets a second copy.**

    Vale is handed `.claude` as a path, and `.claude/worktrees/<name>/` sits
    inside it - so with one worktree open the linter walks the whole repository
    twice and reports the second copy's findings as if they were the tree's.
    Measured 2026-08-18 with a single worktree open: **34 errors, all of them in
    `.claude/worktrees/`, none at `HEAD`** - and the copies do not even lint the
    same as their originals, because the deeper path stops matching the section
    that scopes them. `.claude/rules/docstrings.md` was clean while
    `.claude/worktrees/tables/.claude/rules/docstrings.md` raised
    `KnowledgeBase.AnnouncingImportance` on the same byte.

    **What that costs is the every-tier check, not tidiness.** `verify.sh` runs
    this command and reports the tier red; `test_scope.py` prints it as part of
    what a landing owes. So the one command that is supposed to say whether the
    tree is clean says no, over findings that are not in the tree - and it does
    so exactly when the project's own parallel-work shape is in use, which
    `rules/git-workflow.md` prescribes for a background job and for a live
    second session.
    """
    globs = re.findall(r"--glob='([^']+)'", LINT_PROSE)
    assert globs, (
        "lint:prose walks `.claude` with no exclusion, so one open worktree "
        "lints the whole repository a second time and reports the copy's "
        "findings against this branch"
    )

    # **Vale's `--glob` is last-wins**, measured: appending `--glob='*.md'`
    # after the negation brings all 34 worktree findings back while every
    # structural check here stays green.
    assert globs[-1].startswith("!"), (
        f"the last --glob is {globs[-1]!r}, which overrides the exclusion "
        f"before it - vale keeps only the last one"
    )
    pattern = globs[-1].lstrip("!")

    # **The exclusion has to be a path component, and the obvious spelling is
    # not.** Vale's `*` matches `/`, so `!*worktrees*` also excludes
    # `openspec/specs/a-name-that-reaches-another-worktrees-stack.md` - a real
    # file, dropped from the lint by its own name,
    # which is the silence `.vale.ini`'s header warns about one level up.
    matches = vale_glob(pattern)
    assert matches.match(".claude/worktrees/x/.claude/rules/docstrings.md"), (
        f"{pattern} does not exclude a worktree's copy of a page"
    )
    for name in tracked_markdown():
        assert not matches.match(name), (
            f"{pattern} excludes {name}, which is a tracked file rather than a "
            f"worktree - a page dropped from the lint by its own name"
        )


def test_the_lint_still_walks_every_tree_it_is_meant_to() -> None:
    """**Narrowing the lint is silent, and the exclusion above is a narrowing.**

    Vale's summary counts files *walked*, so a command that stopped naming
    `.claude` prints the same clean result as one covering every page - and the
    knowledge layer, `rules/`, `skills/` and `CLAUDE.md` would go unlinted with
    nothing to show for it. Measured: dropping `.claude` from the argument list
    takes the walk from 1800 files to 1009 and leaves every other check here
    green.

    So the positional arguments are asserted as a set, not merely present.
    """
    positional = [word.strip("'\"") for word in shlex.split(LINT_PROSE)[1:]
                  if not word.startswith("-")]
    assert set(positional) >= {
        "openspec", "README.md", ".devcontainer", ".claude",
        "server/src", "server/test", "server/e2e", "ui/src", "tests",
    }, f"lint:prose no longer walks every tree it is meant to: {positional}"

    for path in positional:
        assert (ROOT / path).exists(), (
            f"lint:prose names {path}, which is not in the tree - vale walks it "
            f"as zero files and reports the same clean summary either way"
        )


#: The bare words inside a token, with the regex machinery stripped.
LITERAL_WORD = re.compile(r"(?<![\\\w])[a-z]{3,}(?![\w])", re.I)


def rules() -> list[Path]:
    return sorted(STYLES.rglob("*.yml"))


@pytest.mark.parametrize("rule", rules(), ids=lambda p: f"{p.parent.name}.{p.stem}")
def test_every_rule_has_something_that_runs_it(rule: Path) -> None:
    """A style nothing consumes is a rule that never runs.

    **There are two consumers, not one.** Vale reads markdown, so a style
    governing `.tsx` or a Zod `.describe()` can never appear in a
    `BasedOnStyles` line -- `Interface` is loaded by `test_ui_copy.py` and
    `Shared` by both. Checking only `.vale.ini` would force every such style to
    be either deleted or falsely wired to a glob that cannot reach it.
    """
    style = rule.parent.name
    listed = [s for s in CONFIG.read_text().split("\n") if s.startswith("BasedOnStyles")]
    by_vale = any(style in line for line in listed)

    # **Recursive, because the suite is filed by subject now.** A flat glob
    # over `tests/` stopped seeing `tests/docs/test_ui_copy.py` the moment the
    # tree gained directories, and the three `Interface` rules it loads read as
    # orphaned styles nothing runs.
    tests = "\n".join(
        p.read_text() for p in sorted((ROOT / "tests").rglob("test_*.py"))
    )
    by_test = f'"{style}"' in tests or f"'{style}'" in tests

    assert by_vale or by_test, (
        f"{rule.relative_to(ROOT)} lives in style '{style}', which no "
        "BasedOnStyles line names and no test loads. Nothing runs it."
    )


# One violation per rule, and the near-misses that must NOT fire. **The
# near-miss column is the half that matters**: every rule here was first written
# wide enough to catch correct prose, and what it had to be narrowed to is the
# only record of why.
#
# `Shared.Terminology`'s near-misses are the ones that cost something: applying
# its alerts by span rewrote a source filename, a `[[wikilink]]` target and a
# note's own `id`, none of which reads as damage in a diff of prose.
#
# **Vale is not the reason those need protecting.** Probed 2026-08-16: it skips
# backticked spans and fenced blocks, so a bare `redis` fires and
# `` `health.redis.ts` `` does not. The exposure is `test_api_prose.py` and
# `test_ui_copy.py`, which run these same tokens over raw TypeScript strings
# where no markdown scope exists to skip.
AWAKE = {
    # **The only structural rule here**, so its near-misses are shapes rather
    # than phrases: an unwrapped paragraph, a short line that ends a paragraph,
    # and a line already at the wrap column whose successor is a new sentence.
    "Shared.HardWrap": (
        "the mutation is chosen by whoever wrote the assertion, and it can\n"
        "only confirm what they already believed about the code",
        ["one line per paragraph, however long the paragraph runs, because a "
         "wrap makes every one-word edit a five-line diff and no reader sees it",
         "A short line.\nAnother short line.",
         "The specifications are the description of this product.\nRead the "
         "constitution before proposing anything."]),
    # The two `ComponentDocs` rules shipped without a proof that they fire,
    # which is exactly what this map exists to refuse. The near-misses are the
    # shapes a component doc is *allowed* to hold: a contract, a precondition,
    # and a consequence the caller cannot see from the signature.
    "ComponentDocs.NoArgument": (
        "the whole reason is that a second ground would double up",
        [
            "Takes the picked row by `id`. Controlled.",
            "Call after `flush`; the path must already exist.",
            "Draws the selected ground. `false` where the caller paints its own.",
            "Shown when validation refuses the value.",
            # `nonword: true` adds no word boundary, so `and that is not` used to
            # match inside `command that is not` -- a chord story's one-line
            # contract, flagged as an argument. The word this fires inside is
            # ordinary in a component doc, which is what makes it worth pinning.
            "A shift-qualified chord, for a command that is not destructive.",
            # `which is the whole` used to carry the "all of it" sense as well
            # as the argument's. Both of these are the first.
            "Both lines of the Account cell: the name it sorts by and the "
            "username under it, which is the whole of what that column draws.",
            "The footer stays put while the rows move, which is the whole point.",
            # A consequence the caller cannot see from the signature is what a
            # docstring is *for*, and bare `so there is no` matched every one of
            # them. These four are the senses the narrowed token has to spare:
            # absent data, an absent row, an absent value to key on, and an
            # absent prop.
            "The probe itself failed, so there is no report and the server is "
            "likely unreachable entirely.",
            "A form has one of each field, so there is no row to name.",
            "The cursor is a ref, so there is no value to key this on.",
            "The shell reads the fold from a flag persisted under "
            "`collapsedKey`, so there is no prop to open it folded.",
            "No local passwords at all, so there is nothing on the other side "
            "of the rule.",
            # A pointer to where the reasons are written is a cross-reference,
            # which `rules/docstrings.md` allows one of.
            "`optionShape` owns both thresholds and the reason for each.",
        ],
    ),
    "ComponentDocs.NoHistory": (
        "this used to be a second implementation",
        [
            "A field that holds a selection and shows the chosen row's label.",
            "The rows are the caller's; this owns the affordance.",
            "Height, from the `--control-h-*` scale.",
        ],
    ),
    "Shared.Terminology": (
        "add it to the whitelist",
        ["add it to the allowlist", "`health.redis.ts`", "redis://cache:6379",
         "id: presence-and-fan-out-belong-in-redis"],
    ),
    # **The good cases are the words at a position the rule does not test.**
    # `Interface.HeadingIsALabel` anchors on `^`, so the same interrogative
    # inside a heading is untouched -- which is what keeps it off the report's
    # own "What happened" and off every Zod `.describe()`. Its surface is
    # heading props alone; `test_ui_copy.SCOPED` is what holds that true.
    "Interface.HeadingIsALabel": (
        "What this account can reach",
        ["Permissions", "Sessions", "Sign-in methods", "Add what happened"],
    ),
    "Shared.Spelling": ("the observed behavior", ["the observed behaviour"]),
    "Shared.Exclamation": ("it works!", ["it works."]),
    "Shared.LinkText": ("[click here](x)", ["[the account settings](x)"]),
    "Shared.Courtesy": ("please see the guide", ["see the guide"]),
    "Shared.Inclusive": ("a sanity check on the input", ["a check on the input"]),
    "Shared.Filler": ("simply run the command", ["not simply restoring it"]),
    "Shared.Redundancy": ("in order to start it", ["to start it"]),
    "Shared.LatinAbbrev": (
        "some fields, e.g. severity", ["some fields, for example severity"]),
    "Shared.RelativeTime": (
        "it currently answers 404",
        ["at the moment of capture", "how recently it ran", "runs concurrently"]),
    "Shared.DefaultBranch": (
        "git merge master",
        ["they exported the customer master table",
         "the compliance master switch, the three regimes",
         "dark list and light master/detail",
         "`master` runs ahead of the v1.3 tag"]),
    "Shared.Directional": (
        "see the table below",
        ["a band above the table", "on the right branch", "the right answer"]),
    # Its own rule so the code sections can switch it off; in a comment `as
    # above` means the line above. The near-misses are the two senses that must
    # survive: a *time* above, and the word inside another word.
    "Shared.DirectionalHere": (
        "the same as above", ["a band above the table", "the phase as absolute"]),
    "Interface.ErrorTone": (
        "Oops, something went wrong", ["The body is not readable"]),
    "Interface.DeviceAgnostic": (
        "type in your username", ["middle-click a title into a new tab"]),
    "Interface.InterfaceWords": (
        "choose from the list", ["Choose a password"]),
    "IncidentCompanion.UiWriting": (
        "toggle the dark mode on", ["Click the title"]),
    "IncidentCompanion.Justification": (
        "The reason is that it works", ["Because it works"]),
    # **The heading text alone, because `scope: heading` is Vale's not Python's.**
    # This checker applies tokens to a bare string; Vale first narrows the
    # document to headings and strips the `##`. Feeding it `## Overview` here
    # would test the wrong thing and fail against an anchored `^overview$`.
    "IncidentCompanion.MediumHeadings": ("Overview", ["What it is built out of"]),
    "IncidentCompanion.InternalNames": ("ic_app owns it", ["the app role owns it"]),
    "KnowledgeBase.AnnouncingImportance": (
        "worth knowing before you start",
        ["a note that fires on everything", "the note that governs it"]),
    "KnowledgeBase.RouteToTheAnswer": (
        "found the hard way after hours of debugging", ["the cause is a stale cache"]),
    "KnowledgeBase.ProseAboutProse": (
        "rather than implying it covered", ["the suite did not cover it"]),
    # The near misses matter more than usual here. A bare `will` is future
    # tense and correct all over the store -- a mechanism that *will* stop
    # firing is a description, not a plan -- so the rule names only the forms
    # that can mean nothing but intent.
    "KnowledgeBase.PlansBelongInAChange": (
        "the second door is planned",
        ["a note whose glob stops matching will never appear again",
         "the pipeline is unbuilt rather than broken",
         "it will refuse the merge"]),
}


def load_tokens(style: str, name: str) -> list[str]:
    """A rule's patterns, whichever key it states them under.

    `raw` is the third: a rule matching markup rather than words states its
    regex there, and `tokens` is absent rather than empty.
    """
    body = yaml.safe_load((STYLES / style / f"{name}.yml").read_text())
    if body.get("extends") == "substitution":
        return list(body["swap"].keys())
    return list(body.get("tokens") or body["raw"])


def load_swaps(style: str, name: str) -> dict[str, str]:
    """A substitution rule's pattern to its replacement, or empty for other kinds.

    Callers need the replacement to tell a violation from the correct form: the
    patterns are matched case-insensitively, so `redis -> Redis` fires on
    `Redis` itself and asks for what is already written. That is the shape
    `test_rule_fires_on_its_violation_and_not_on_its_near_miss` exists to
    refuse, and it can only be refused by something holding both halves.
    """
    body = yaml.safe_load((STYLES / style / f"{name}.yml").read_text())
    if body.get("extends") != "substitution":
        return {}
    return dict(body["swap"])


@pytest.mark.parametrize("check", sorted(AWAKE))
def test_rule_fires_on_its_violation_and_not_on_its_near_miss(check: str) -> None:
    style, name = check.split(".")
    tokens = load_tokens(style, name)
    bad, goods = AWAKE[check]

    def matches(text: str) -> bool:
        return any(re.search(t, text, re.I) for t in tokens)

    assert matches(bad), f"{check} no longer fires on {bad!r} -- the rule went inert."
    for good in goods:
        assert not matches(good), (
            f"{check} fires on {good!r}, which is the correct form. "
            "This is the shape that gets a rule switched off within a day -- or, "
            "when the alert is applied by span, silently rewrites an identifier."
        )

@pytest.mark.parametrize("rule", rules(), ids=lambda p: f"{p.parent.name}.{p.stem}")
def test_every_rule_has_an_awake_entry(rule: Path) -> None:
    """A rule with no violation example is a rule nobody has ever seen fire.

    **Ten of twenty-two had none**, which is how `UiWriting`'s toggle token
    shipped with a character class that could not cross a two-word control
    name -- the rule's own comment described the phrase it could not match, and
    its "zero hits today" note read as a virtue.

    This asserts one entry per rule file, not per token. `AWAKE` exercises 12
    of 166 tokens and that gap is real; a per-token table would have to be
    generated rather than written, and is not built.
    """
    assert f"{rule.parent.name}.{rule.stem}" in AWAKE, (
        f"{rule.relative_to(ROOT)} has no entry in AWAKE, so nothing has ever "
        "checked that it fires."
    )


def test_no_vocabulary_term_silences_a_rule() -> None:
    """`Vocab` wins over every style, and nothing else would notice.

    Vale skips any token matching an accepted term. Measured: adding
    `whitelist` and `sanity` to `accept.txt` took `Shared.Terminology` and
    `Shared.Inclusive` from firing to zero errors, with no warning of any kind.
    Matching is case-exact, so `Nginx` still fires with `nginx` accepted.

    None of the shipped terms collides today; this keeps it that way.
    """
    accept = ROOT / ".vale" / "styles" / "config" / "vocabularies" / "IncidentCompanion" / "accept.txt"
    terms = [t.strip() for t in accept.read_text().split("\n") if t.strip()]
    assert terms, "the vocabulary is empty; the Vocab key points at nothing"

    collisions = []
    for path in rules():
        for token in load_tokens(path.parent.name, path.stem):
            # **A whole-token match is the wrong test, and was the first one
            # written here.** Vale suppresses an alert when an accepted term
            # appears *inside* the matched span, so `sanity` in the vocabulary
            # kills `sanity[- ]check` — and `re.fullmatch('sanity[- ]check',
            # 'sanity')` is `None`. Measured: adding `sanity` to `accept.txt`
            # took Vale from firing to silent while this test stayed green.
            #
            # A token's own literal words are decidable, and they are the
            # dangerous case: if one of them is an accepted term, *every* match
            # contains it and the rule is dead outright.
            for word in LITERAL_WORD.findall(token):
                for term in terms:
                    # Case-exact: `Redis` is accepted while `Shared.Terminology`
                    # swaps lowercase `redis`, and that pair coexists — the swap
                    # fired 22 times with the vocabulary in place.
                    if word == term:
                        collisions.append(
                            f"{path.parent.name}.{path.stem}: {token!r} contains {term!r}"
                        )
    assert not collisions, (
        "a vocabulary term is matched by a rule token, so Vale will skip it "
        "silently:\n  " + "\n  ".join(collisions)
    )
