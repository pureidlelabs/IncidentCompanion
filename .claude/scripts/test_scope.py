#!/usr/bin/env python3
"""Say which suites a change needs, from the paths it touched.

**Six tiers, and each has exactly one command.** The answer is mechanical —
`git diff --name-only` in, commands out — so it is not a judgement made while
wanting to commit.

**`app/` routes to nothing.** It is the retired Python corpus, read rather than
run, and nothing executes `app/tests` — not `./test.sh`, not CI.

**It selects a tier whole and never maps a change to the tests that cover it**,
which is deliberate: a `test_<stem>.py` name match reaches 57 of 119 modules,
so a tool claiming that mapping would be guessing. Naming the test you wrote is
still the author's job.

**The browser tier is printed as its own command.** It cannot be handed to
`pytest -n auto` alongside anything — it is Playwright, in the server package,
against the stack `dev-node.sh` runs.

`--landing` reads the branch rather than the working tree, and widens nothing:
a `.claude`-only branch does not owe the server suite because it is landing.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from urllib.parse import urlparse

SERVER = "server/"
UI = "ui/"
BROWSER = "server/e2e/"
PYTHON = "tests/"
AGENT = ".claude/"
CORPUS = "app/"

#: What counts as source when no tier claims a path. An asset, a lockfile or a
#: generated bundle owes nothing and says so; a file ending in one of these is
#: something somebody wrote, and the router widening is cheaper than a tier
#: nobody told it about landing unrun.
SOURCE_SUFFIXES = (".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js", ".jsx",
                   ".py", ".sh", ".sql")

#: The stack's own declarations, which no tier glob claims and root `tests/`
#: asserts on: `test_container_config.py` reads `compose.yaml`,
#: `test_stack_images.py` the Dockerfiles, `test_ui_build_contract.py` the
#: manifests. Named rather than left to the widen, because these are *claimed*
#: -- something does test them -- and answering "every suite" for a compose
#: edit is as wrong as answering "none".
STACK_DECLARATIONS = (
    "compose.yaml", "compose.dev.yaml", "package.json", "package-lock.json",
    "Dockerfile", "nginx.conf", "pyproject.toml", "requirements.txt",
)

#: Prose Vale reads. `.vale/` is included because one token re-lints every file.
PROSE_TREES = ("openspec/", ".vale/")
PROSE_FILES = ("README.md", ".vale.ini")

#: Changes whose defect is a *position* rather than a value, so only a browser
#: can see them. Narrower than "anything that renders": what is here is what a
#: browser assertion exists for today.
BROWSER_SURFACE = (BROWSER, "ui/src/", "ui/index.html")

#: A story is the only place several component states exist at once, and the
#: probe over them measures what no other tier can perceive - contrast, hit
#: area, overlap, clipping. It found a label at 1.00:1 that the unit tier, the
#: story tier, the rule tier and three adversarial readers all passed.
#:
#: **It needs a Storybook**, which is why it is its own line rather than folded
#: into the browser tier: one command with two preconditions means the half
#: that cannot run looks like the half that found nothing.
STORY_SURFACE = ("ui/.storybook/", "ui/src/components/", "ui/src/screens/")

def changed(base: str | None) -> list[str]:
    """**`--no-renames`, because a moved file is otherwise reported only at its
    new path** — and a rename across a tier boundary would then hide the side
    it left.
    """
    if base:
        for ref in (base,):
            probe = subprocess.run(["git", "rev-parse", "--verify", "--quiet", ref.split("..")[0]],
                                   capture_output=True, text=True)
            if probe.returncode != 0 and ".." not in base:
                print(f"test_scope: {base!r} is not a ref this repository has.\n"
                      "Give a ref, or no argument to read the working tree.",
                      file=sys.stderr)
                raise SystemExit(2)
        out = subprocess.run(["git", "diff", "--name-only", "--no-renames", base],
                             capture_output=True, text=True, check=True).stdout
    else:
        tracked = subprocess.run(["git", "diff", "--name-only", "--no-renames", "HEAD"],
                                 capture_output=True, text=True, check=True).stdout
        untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"],
                                   capture_output=True, text=True, check=True).stdout
        out = tracked + untracked
    return sorted({p for p in out.split("\n") if p})


def touches(paths: list[str], *prefixes: str) -> bool:
    return any(p.startswith(prefixes) for p in paths)


def touches_prose(paths: list[str]) -> bool:
    """Every `.md` under `.claude/` counts, and so does a rule file: one token
    changes what fires across all 780 files, not only the page in the diff.
    """
    if touches(paths, *PROSE_TREES) or any(p in PROSE_FILES for p in paths):
        return True
    return any(p.endswith(".md") for p in paths)


#: One path per tier, so `commands()` answers with everything that has a suite.
#: Built from the tiers rather than written out, so a tier added below cannot be
#: left out of a widened run -- which is the failure this whole rule is about.
WIDEN_PROBE = [
    ".claude/tests/x.py", "tests/x.py", "server/src/x.ts", "ui/src/x.tsx",
    "openspec/x.md", "server/e2e/x.spec.ts",
]


def claimed(path: str) -> bool:
    """Asked per path rather than per diff: `commands()` takes the whole list and
    says which tiers were touched, which cannot tell a recognised file from an
    unrecognised one sitting beside it.
    """
    return bool(commands([path]))


def commands(paths: list[str]) -> list[tuple[str, str]]:
    """Ordered cheapest first, so a reader running them in order fails fast."""
    out: list[tuple[str, str]] = []

    if touches(paths, AGENT):
        out.append(("python3 -m pytest .claude/tests -q -n auto",
                    "the agent tooling's own guards"))
    if touches(paths, PYTHON) or any(p.rsplit("/", 1)[-1] in STACK_DECLARATIONS for p in paths):
        out.append(("./test.sh",
                    "the Python tier: docker, docs, repo and the cross-tier contracts"))
    if touches(paths, SERVER):
        out.append(("(cd server && npm run check && npm run lint)",
                    "typecheck, the Nest suite, and the eslint config nothing used to load"))
    if touches(paths, UI):
        out.append(("(cd ui && npm run typecheck && npm test && npm run lint)",
                    "the React tier; `typecheck` is `tsc -b` -- `tsc --noEmit` checks nothing here"))
    if touches_prose(paths):
        out.append(("npm run lint:prose",
                    "Vale over openspec/, README.md and .claude/ -- in neither ./test.sh nor CI"))
    if touches(paths, "openspec/"):
        out.append(('npx --no-install openspec validate --strict',
                    "the spec tree's own shape -- owed with the lint. The CLI is a "
                    "pinned dev dependency, and `--no-install` keeps npm out of it"))
    if touches(paths, *BROWSER_SURFACE):
        out.append((
            "(cd ui && npm run build) && "
            "(cd server && npx playwright test --config=e2e/playwright.config.ts)",
            "the browser tier, and the build it drives -- a stale `ui/dist` fails as a defect"))
    if touches(paths, *STORY_SURFACE) or any(p.endswith(".stories.tsx") for p in paths):
        out.append((
            "(cd ui && npm run storybook &) && (cd server && npm run visual:storybook)",
            "the probe over every story, both grounds -- it is the only tier that can see "
            "a colour or a hit area, and it exits 0 whether it found nothing or a hundred "
            "things -- read the findings it prints, because the pass says only that it "
            "could look"))
    return out


def decide(paths: list[str]) -> tuple[list[tuple[str, str]], str]:
    if not paths:
        return [], "nothing changed"

    if all(p.startswith(CORPUS) for p in paths):
        return [], ("the retired Python corpus -- read to check what the Node rewrite "
                    "replaced, and run by nothing")

    found = commands(paths)

    # **Source no tier claims widens; anything else owes nothing.**
    # A map cannot cover a directory nobody has created yet, and answering
    # "no suite" for an unrecognised *source* path reads as permission: a new
    # tier, or a rename this file has not been told about, would land with
    # nothing run and the router agreeing that was right. An asset or a
    # lockfile genuinely owes nothing, and saying so is what keeps this from
    # collapsing into "always run everything".
    #
    # **Unioned rather than used as a fallback**, because a diff almost never
    # holds one path. Checking this only when nothing matched meant one
    # recognised file silenced it -- and `changed()` passes `--no-renames`, so a
    # file moved out of a known tier arrives as *both* sides. The rename this
    # rule exists for was the case it did not cover.
    unclaimed = [p for p in paths
                 if p.endswith(SOURCE_SUFFIXES) and not p.startswith(CORPUS) and not claimed(p)]
    if unclaimed:
        widened = [c for c in commands(WIDEN_PROBE) if c not in found]
        return found + widened, (
            f"{unclaimed[0]} matches no tier, so every suite with one is owed "
            "until this file is told about it"
        )

    if found:
        return found, f"{len(found)} tier(s) touched"
    return [], "nothing here has a suite: fixtures, assets or generated output"


def stackless(port_of=None, reachable=None) -> str | None:
    """What the server unit tier will not run, or `None` when it will run it all.

    **The stack-down run skips the authorisation model among its noise** -- among them
    `analyst-privilege`, `access/case-routes-guarded` and both
    `session-revocation` files, which is the authorisation model. They are `describe.skipIf(!bootable())`, and
    `bootable()` is false with no Redis listening.

    **The server unit tier only.** The browser tier has the same shape and is
    not covered here: it needs a reachable API and a built `ui/dist`, and
    `verify.sh` guards it separately on `apiPort`.
    `verify.sh` already states this; nothing did at landing, which is the run
    that happens several times a day.

    Both probes are arguments so the decision can be tested without a stack:
    the shape this guards against is a checker that only ever sees one
    environment. -> `.claude/tests/test_test_scope.py`
    """
    port_of = port_of or _redis_port
    reachable = reachable or _reachable
    port = port_of()
    if port is None:
        return "stack.mjs gave no port, so what the server suite skips is unknown"
    if reachable(port):
        return None
    return (
        f"no stack on 127.0.0.1:{port} -- the database-backed server files "
        f"will skip in silence, the authorisation model among them"
    )


def _redis_port() -> int | None:
    # **`REDIS_URL` first, because that is what `bootable()` resolves** --
    # `process.env.REDIS_URL ?? stackEnv()['redisUrl']` in `test/app-harness.ts`.
    # Reading only the stack answers for a different Redis than the suite will
    # probe, and the wrong direction is silent: a dead URL against a live stack
    # would say nothing while 109 cases skip.
    given = os.environ.get("REDIS_URL")
    if given:
        try:
            return int(urlparse(given).port or 6379)
        except ValueError:
            return None
    try:
        # Relative, as every git call in this file is: the script is run from
        # the repository root and says so by failing there if it is not.
        out = subprocess.run(["node", "scripts/stack.mjs", "--json"],
                             cwd="server", capture_output=True, text=True, timeout=60)
        return int(json.loads(out.stdout)["redisPort"]) if out.returncode == 0 else None
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        return None


def _reachable(port: int) -> bool:
    with socket.socket() as probe:
        probe.settimeout(0.4)
        return probe.connect_ex(("127.0.0.1", port)) == 0



_LANDING_BASES = ("@{upstream}", "origin/HEAD")


def _landing_base(given: str | None) -> str:
    if given:
        return given
    for ref in _LANDING_BASES:
        probe = subprocess.run(["git", "rev-parse", "--verify", "--quiet", ref],
                               capture_output=True, text=True)
        if probe.returncode == 0:
            return ref
    return "origin/main"


def main() -> int:
    landing = "--landing" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    if landing:
        given = args[0] if args else None
        # **A range given outright is used as it stands.** Appending `..HEAD` to
        # one produces `a..b..HEAD`, which git rejects with 128 -- and the
        # traceback names git rather than this line.
        base = _landing_base(given)
        paths = changed(base if ".." in base else f"{base}..HEAD")
        found, why = decide(paths)
        why = f"landing -- {why}"
    else:
        paths = changed(args[0] if args else None)
        found, why = decide(paths)

    print(f"changed: {len(paths)} path(s)")
    for p in paths[:10]:
        print(f"   {p}")
    if len(paths) > 10:
        print(f"   ... and {len(paths) - 10} more")

    print(f"\n{why}")
    if not found:
        print("run: nothing")
        return 0
    for command, reason in found:
        print(f"run: {command}\n     # {reason}")

    if any("npm run check" in command for command, _ in found):
        gap = stackless()
        if gap:
            print(f"\nnot run: {gap}\n     # `npm run db:up` in server/ first, or land knowing it")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
