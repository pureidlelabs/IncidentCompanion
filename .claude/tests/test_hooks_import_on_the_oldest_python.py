"""Every *guard* refuses an unsupported interpreter instead of failing open.

**A hook that raises at import exits 1, and exit 1 permits** — so `python3`
resolving to something old turns a guard into a silent no-op, in the unsafe
direction.

**The floor is 3.14**, the same number as `requires-python`, the container
base, the CI matrix and the README badge.

Asserted as a source property rather than by executing under 3.9: no old
interpreter is guaranteed on a contributor's machine, and a skipped test is how
this shipped twice.
"""

import ast
import subprocess
import sys
from pathlib import Path

import pytest

HOOKS_DIR = Path(__file__).resolve().parents[1] / "hooks"


def _guards() -> list[str]:
    """The hooks whose failure disarms a rule, derived rather than typed.

    **A hardcoded list stops covering the file that matters the moment the
    wiring moves.** With a hook outside such a list, lowering its
    gate to 3.9 and deleting the gate outright both left the whole suite green.

    A hook that nudges rather than refusing an action stays out: its safe
    failure is to be absent, so failing closed on an old interpreter is the
    wrong direction. `stop_nudge.py` is that shape, and is named accordingly.
    """
    every = {p.name for p in HOOKS_DIR.glob("*_guard.py")}
    every |= {p.name for p in HOOKS_DIR.glob("*_guards.py")}
    return sorted(every)


GUARDS = _guards()

FLOOR = (3, 14)


def _version_gate(source: str) -> ast.If | None:
    """The `if sys.version_info < (...)` statement at module level, if any."""
    for node in ast.parse(source).body:
        if not isinstance(node, ast.If):
            continue
        test = node.test
        if (isinstance(test, ast.Compare)
                and isinstance(test.left, ast.Attribute)
                and test.left.attr == "version_info"):
            return node
    return None


@pytest.mark.parametrize("name", GUARDS)
def test_every_guard_names_a_python_floor(name: str) -> None:
    path = HOOKS_DIR / name
    assert path.exists(), f"{name} is listed as a guard and does not exist"

    gate = _version_gate(path.read_text())
    assert gate is not None, (
        f"{name} has no `if sys.version_info < ...` gate. Without it an old "
        f"interpreter raises at import, the hook exits 1, and exit 1 permits "
        f"the command it was guarding."
    )

    floor = ast.literal_eval(gate.test.comparators[0])
    assert floor >= FLOOR, f"{name} accepts Python {floor}, below the tested floor"


@pytest.mark.parametrize("name", GUARDS)
def test_the_gate_blocks_rather_than_permits(name: str) -> None:
    """`raise SystemExit(2)`, never a bare return or exit 1.

    Exit 2 is the only code that blocks. A gate that exits 0 or 1 announces the
    problem and then allows exactly what it was meant to stop.
    """
    gate = _version_gate((HOOKS_DIR / name).read_text())
    codes = [
        ast.literal_eval(node.exc.args[0])
        for node in ast.walk(gate)
        if isinstance(node, ast.Raise)
        and isinstance(node.exc, ast.Call)
        and getattr(node.exc.func, "id", "") == "SystemExit"
        and node.exc.args
    ]
    assert codes == [2], f"{name}'s version gate exits {codes or 'nothing'}, not 2"


@pytest.mark.parametrize("name", GUARDS)
def test_the_gate_runs_before_anything_that_could_raise(name: str) -> None:
    """It has to precede the first `def`, whose annotations evaluate at import.

    PEP-604 annotations *parse* on an old interpreter and fail when the `def`
    executes — so a gate placed after the first function is never reached on
    the interpreter it exists for.
    """
    body = ast.parse((HOOKS_DIR / name).read_text()).body
    gate_at = next(i for i, n in enumerate(body)
                   if isinstance(n, ast.If) and _version_gate(ast.unparse(n)))
    first_def = next((i for i, n in enumerate(body)
                      if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))), len(body))
    assert gate_at < first_def, f"{name}'s gate sits after its first def"


def test_every_hook_still_parses_here() -> None:
    """A syntax error would exit 1 — fail-open — for every hook, gated or not."""
    for path in sorted(HOOKS_DIR.glob("*.py")):
        probe = subprocess.run(
            [sys.executable, "-c", f"import ast; ast.parse(open({str(path)!r}).read())"],
            capture_output=True, text=True, timeout=15,
        )
        assert probe.returncode == 0, f"{path.name}: {probe.stderr}"
