"""One node_modules for two packages, asserted by resolution rather than by config.

**The repository already needed this and faked it.** `docker/app/Dockerfile`
carried `ln -s /ui/node_modules /server/node_modules` with a comment saying
why: the client build reads `@contract/*` into `server/src/domain`, and the
packages those files import have to resolve by bare name. That symlink made the
image work and left local development, the type checker and every test tier
resolving two separate trees.

Two copies is not a tidiness problem. Measured 2026-08-18, before this:

    server/node_modules   642 MB
    ui/node_modules       438 MB
    present in both       170 top-level packages, ~158 MB

and the consequence that actually bit was type identity - a value imported
through `@contract/*` carried the *server's* `@tiptap/core` types while the
client held its own, so the two did not unify and a module shared between the
tiers would not compile.

**Asserted by resolving, not by reading `package.json`.** A `workspaces` key
can be declared while the trees stay split - an `npm ci` run inside a package
re-splits them, which is what `worktree_setup.sh` used to do twice on purpose.
The property is that both packages reach the same file.
"""

from __future__ import annotations

import json
import subprocess

import pytest

from tests._must_run import declined
from tests._repo import REPO_ROOT

PACKAGES = ("server", "ui")

#: Declared by both packages, so a split shows up as two answers rather than
#: as a missing module.
SHARED = "yjs"


def root_manifest() -> dict:
    return json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))


def test_the_root_declares_both_packages_as_workspaces() -> None:
    declared = root_manifest().get("workspaces")
    assert declared, (
        "the root package.json declares no workspaces, so `npm ci` in each "
        "package builds a separate tree and anything shared between the tiers "
        "resolves twice"
    )
    for name in PACKAGES:
        assert any(name == entry or entry.startswith(f"{name}/") or entry == "*"
                   for entry in declared), f"{name} is not in workspaces: {declared}"


def test_one_lockfile_decides_for_the_whole_tree() -> None:
    """**Two lockfiles is two answers to what version is installed.**

    A workspace install writes one at the root and none in the packages; a
    leftover package lockfile is what a stray `npm install --prefix` produces,
    and it goes on deciding for anyone who runs `npm ci` in that directory.
    """
    assert (REPO_ROOT / "package-lock.json").is_file(), "no lockfile at the root"
    for name in PACKAGES:
        stale = REPO_ROOT / name / "package-lock.json"
        assert not stale.is_file(), (
            f"{name}/package-lock.json survives the move to workspaces, so "
            f"`npm ci` in {name}/ still builds that package its own tree"
        )


def test_the_root_denies_every_install_script_the_packages_denied() -> None:
    """**A workspace install reads `allowScripts` from the root, and only there.**

    Both packages declared every install script and denied it - `esbuild` and
    `@swc/core` because their fallbacks run a network fetch at install time,
    and `@scarf/scarf` because its `report.js` POSTs the install to scarf.sh.
    Declaring them is what keeps `npm install-scripts ls` empty, so a genuinely
    new install script shows up in that output instead of being lost among
    known ones.

    Moving to workspaces silently dropped all of it: npm warned about three
    uncovered scripts on the first root install, and a warning is not a denial.
    """
    denied = root_manifest().get("allowScripts")
    assert denied is not None, (
        "the root declares no allowScripts, so a workspace install warns about "
        "every install script instead of denying it, and the packages' own "
        "declarations are read by nobody"
    )
    for package in ("esbuild", "@swc/core", "@scarf/scarf"):
        assert denied.get(package) is False, (
            f"{package} is no longer denied at the root - `npm install-scripts "
            f"approve --all`, which the build warning invites, undoes all three"
        )


def resolved(package: str, module: str) -> str | None:
    """Where `module` resolves to from inside `package`, or None if it cannot."""
    done = subprocess.run(
        ["node", "-e", f"process.stdout.write(require.resolve({module!r}))"],
        cwd=REPO_ROOT / package, capture_output=True, text=True, timeout=60,
    )
    return done.stdout.strip() if done.returncode == 0 else None


def shared_at_one_range() -> list[str]:
    """Packages both manifests declare at the *same* version range.

    A dependency both pin at one range must resolve to one copy; a workspace
    hoists it. One they pin at *different* ranges is a deliberate skew npm nests
    on purpose - `typescript` is server 6.x, ui 5.x - and nesting is correct
    there, so it is excluded rather than reported.
    """
    spec = {}
    for name in PACKAGES:
        manifest = json.loads(
            (REPO_ROOT / name / "package.json").read_text(encoding="utf-8"))
        spec[name] = {**manifest.get("dependencies", {}),
                      **manifest.get("devDependencies", {})}
    both = set(spec["server"]) & set(spec["ui"])
    return sorted(m for m in both if spec["server"][m] == spec["ui"][m])


def test_every_shared_dependency_resolves_to_one_copy() -> None:
    """**The property, and the one a `workspaces` key alone does not carry.**

    A dependency both packages declare resolves twice on a split tree - which is
    what the Dockerfile's symlink was buying, and what type identity across
    `@contract/*` needs. Asserted over *every* shared dependency rather than one
    sentinel, because the original bug was `@tiptap/core` skewing and nesting
    while `yjs` stayed single - a one-dependency check would have stayed green
    through it.

    **This declined in every CI run and reported as a pass**, which is the
    defect #61 is about, in the tier that certifies. The `repository` job
    installs Python and nothing else -- no `setup-node`, no `npm ci` -- so
    `node_modules` has never existed when this runs. As a bare `skipif` that
    was invisible; through `declined` it is a failure wherever the run claims
    to certify, and still an ordinary skip in a fresh checkout.
    """
    if not (REPO_ROOT / "node_modules").is_dir():
        declined("The one-copy check", "nothing is installed in this checkout")

    split = []
    for module in shared_at_one_range():
        where = {name: resolved(name, module) for name in PACKAGES}
        if any(path is None for path in where.values()):
            continue  # a bare package name that is not itself importable
        if len(set(where.values())) != 1:
            split.append(f"{module}: " + ", ".join(
                f"{name}={path}" for name, path in where.items()))
    assert not split, (
        "these shared dependencies resolve to more than one copy, so anything "
        "built from them across the tiers holds two types:\n" + "\n".join(split))


def test_the_image_no_longer_symlinks_one_tree_at_the_other() -> None:
    """The hack this replaces, so it cannot come back beside the mechanism.

    A symlink and a workspace are two answers to one question, and the symlink
    is the one that deletes the tree it points at when npm installs through it.

    """
    dockerfile = (REPO_ROOT / "docker" / "app" / "Dockerfile").read_text(encoding="utf-8")
    executable = [line for line in dockerfile.split("\n")
                  if not line.lstrip().startswith("#")]
    offenders = [line.strip() for line in executable
                 if "ln -s" in line and "node_modules" in line]
    assert not offenders, (
        "the image still links one package's node_modules at the other's, and "
        "the workspace install is what makes that unnecessary:\n"
        + "\n".join(offenders)
    )


def test_no_script_reaches_into_a_package_local_node_modules() -> None:
    """**A hoisted install moves the binaries, and a hard-coded path is silent.**

    `test.sh` ran `node ui/node_modules/typescript/bin/tsc` and
    `node ui/node_modules/vitest/vitest.mjs`. Under a workspace the hoist
    decides where those land - and with `typescript` differing by a major
    between the two packages, which one stays nested is npm's choice rather
    than ours. The scripts ask npm instead.
    """
    offenders = []
    for name in ("test.sh", "verify.sh", "dev-node.sh"):
        path = REPO_ROOT / name
        if not path.is_file():
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").split("\n"), 1):
            if line.lstrip().startswith("#"):
                continue
            if any(f"{package}/node_modules" in line for package in PACKAGES) or (
                "node node_modules/" in line
            ):
                offenders.append(f"{name}:{number}: {line.strip()}")
    assert not offenders, (
        "these reach into a package's own node_modules, which a workspace "
        "install may not fill:\n" + "\n".join(offenders)
    )


def test_the_shell_lint_is_clean() -> None:
    """**A dead flag trips shellcheck, and `verify.sh` runs it.** `worktree_setup.sh`
    parsing `--no-ui` into a variable it then never read raised `SC2034` and
    exited nonzero, reddening the every-tier check - which the landing does
    not run, so it would have reached the release branch. Kept here rather than
    left to `verify.sh`, which does not run under `pytest`."""
    import shutil
    if shutil.which("shellcheck") is None:
        # **A plain skip, deliberately, and not `declined`.** The `repository`
        # job installs Python and nothing else, so this declines there -- but
        # the `lint` job installs shellcheck and runs it over the same files,
        # so the property is asserted in CI regardless and a decline here loses
        # nothing. Arming it would redden a job for a check another one already
        # made. -> `.github/workflows/ci.yml`
        pytest.skip("shellcheck not on PATH; the lint job asserts this in CI")
    files = subprocess.run(["git", "ls-files", "*.sh"], cwd=REPO_ROOT,
                           capture_output=True, text=True, check=True).stdout.split()
    done = subprocess.run(["shellcheck", "-S", "warning", *files],
                          cwd=REPO_ROOT, capture_output=True, text=True)
    assert done.returncode == 0, f"shellcheck -S warning is not clean:\n{done.stdout}"


def test_the_runtime_stage_installs_only_the_server_workspace() -> None:
    """**The client's dependencies must stay out of the shipped image.** A root
    `npm ci` in the runtime-deps stage would hoist react and the rest into the
    final tree; `--workspace server` is what keeps them out. Asserted on the
    Dockerfile because building the image in a unit test is too slow - the
    react-absence itself is verified by the build, this holds the line that
    makes it true."""
    dockerfile = (REPO_ROOT / "docker" / "app" / "Dockerfile").read_text(encoding="utf-8")
    stage = dockerfile.split("AS runtime-deps", 1)[1].split("\nFROM ", 1)[0]
    ci_lines = [line for line in stage.splitlines()
                if "npm ci" in line and not line.lstrip().startswith("#")]
    assert ci_lines, "the runtime-deps stage runs no npm ci"
    for line in ci_lines:
        assert "--workspace server" in line, (
            f"runtime-deps installs without --workspace server, so the client's "
            f"own dependencies ship in the image: {line.strip()}")
