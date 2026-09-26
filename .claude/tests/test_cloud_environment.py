"""A cloud session's shells resolve every tool to its own binary, never to a mise shim.

A shim re-applies the root `mise.toml` environment on every hop, so
`DATABASE_URL="$IC_MIGRATE_DATABASE_URL" npm run db:push` reaches the schema
step as `ic_app` and is refused.
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
    out = subprocess.run(["bash", "-c", 'source "$HOME/.bashrc"; echo "${MISE_GLOBAL_CONFIG_FILE:-unset} $PATH"'],
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


def test_the_session_hook_hands_its_path_to_the_agents_shell():
    """A hook's exports end with the hook; `CLAUDE_ENV_FILE` is what carries them on."""
    text = SESSION.read_text(encoding="utf-8")
    assert re.search(r'>> "\$CLAUDE_ENV_FILE"', text), "cloud_session.sh never writes CLAUDE_ENV_FILE"
