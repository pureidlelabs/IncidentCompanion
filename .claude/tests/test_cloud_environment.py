"""A cloud session's shells resolve every tool to its own binary, never to a mise shim.

A shim re-evaluates the root `mise.toml` environment, running the stack script,
before every call it stands in front of.
"""

import pathlib
import re
import subprocess

REPO = pathlib.Path(__file__).resolve().parents[2]
SETUP = REPO / ".claude" / "scripts" / "cloud_setup.sh"
SESSION = REPO / ".claude" / "scripts" / "cloud_session.sh"

# Ubuntu's own first lines: everything after them is skipped by any shell
# without a prompt, which is every shell a tool or a hook starts.
UBUNTU_BASHRC = '[ -z "$PS1" ] && return\nexport LATE=1\n'


def bashrc_writer() -> str:
    """The part of the setup script that writes the `.bashrc` block."""
    text = SETUP.read_text(encoding="utf-8")
    match = re.search(r"^BEGIN=.*?^echo \"ready:", text, re.S | re.M)
    assert match, "the setup script no longer writes a .bashrc block where this test looks"
    return text[match.start():match.end() - len('echo "ready:')]


def test_no_cloud_script_puts_the_mise_shims_on_path():
    for script in (SETUP, SESSION):
        for line in script.read_text(encoding="utf-8").splitlines():
            if "PATH=" in line:
                assert "mise/shims" not in line, f"{script.name}: {line.strip()}"


def test_a_shell_without_a_prompt_still_reads_the_block(tmp_path):
    (tmp_path / ".bashrc").write_text(UBUNTU_BASHRC, encoding="utf-8")
    env = {"HOME": str(tmp_path), "PATH": "/usr/bin:/bin"}
    subprocess.run(["bash", "-c", "set -euo pipefail\n" + bashrc_writer()],
                   env=env, check=True)
    # Under `set -e`, as a script sourcing it would be: a missing mise must not end it.
    out = subprocess.run(["bash", "-c", 'set -eo pipefail; source "$HOME/.bashrc"; echo "${MISE_GLOBAL_CONFIG_FILE:-unset} $PATH"'],
                         env=env, check=True, capture_output=True, text=True).stdout
    assert out.startswith("/etc/mise/config.toml "), out
    # No mise in the sandbox, so no tool directories, and no empty PATH entry.
    assert f" {tmp_path}/.local/bin:/usr/bin:/bin" in out, out


def test_rewriting_the_block_keeps_one_copy_and_the_rest_of_the_file(tmp_path):
    (tmp_path / ".bashrc").write_text(UBUNTU_BASHRC, encoding="utf-8")
    env = {"HOME": str(tmp_path), "PATH": "/usr/bin:/bin"}
    for _ in range(2):
        subprocess.run(["bash", "-c", "set -euo pipefail\n" + bashrc_writer()],
                       env=env, check=True)
    text = (tmp_path / ".bashrc").read_text(encoding="utf-8")
    assert text.count("# >>> incidentcompanion cloud >>>") == 1, text
    assert text.endswith(UBUNTU_BASHRC), text


def stub(path: pathlib.Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8")
    path.chmod(0o755)


def test_the_session_hook_hands_its_tools_to_the_agents_shell(tmp_path):
    """Runs the hook against stubs: a mise listing one tool directory, and a
    Chromium install that fails, so the hand-over must precede that exit.

    The stubs `cmp` and `pgrep` keep it off `/etc/mise` and dockerd.
    """
    home, project, tools = tmp_path / "home", tmp_path / "project", tmp_path / "tools"
    local = home / ".local" / "bin"
    stub(local / "mise", f'[ "$1" = bin-paths ] && echo {tools}; exit 0')
    stub(local / "cmp", "exit 0")
    stub(local / "pgrep", "exit 0")
    stub(tools / "node", "echo stub-node")
    stub(tools / "npx", "exit 1")
    (project / "node_modules" / ".bin").mkdir(parents=True)
    stub(project / ".venv" / "bin" / "python", "exit 0")
    (project / "server").mkdir()
    env_file = tmp_path / "env"
    env_file.touch()
    subprocess.run(["bash", str(SESSION)], input='{"hook_event_name":"SessionStart","source":"startup"}',
                   env={"HOME": str(home), "PATH": "/usr/bin:/bin", "CLAUDE_CODE_REMOTE": "true",
                        "CLAUDE_PROJECT_DIR": str(project), "CLAUDE_ENV_FILE": str(env_file)},
                   check=True, capture_output=True, text=True, timeout=30)
    out = subprocess.run(["bash", "-c", f'source {env_file}; echo "$PATH"; node'],
                         env={"HOME": str(home), "PATH": "/usr/bin:/bin"},
                         check=True, capture_output=True, text=True).stdout.splitlines()
    assert out[0].split(":")[0] == str(tools), out
    assert "shims" not in out[0], out
    assert out[1] == "stub-node", out
