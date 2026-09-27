"""A copy of an install stays out of the repository and out of every image's build context.

A copy holds every case, every artefact and every password hash, and this
repository is public.
"""

import re
import subprocess

from tests._repo import REPO_ROOT

#: The directory `docker/backup.sh backup` writes into when given none, read from the script.
DEFAULT = re.search(r'dir="\$\{1:-\$ROOT/([^/"]+)/',
                    (REPO_ROOT / "docker" / "backup.sh").read_text(encoding="utf-8"))


def test_the_default_copy_directory_is_found():
    assert DEFAULT, "docker/backup.sh no longer defaults under the repository root; this file reads nothing"


def test_git_ignores_a_copy_written_by_default():
    probe = f"{DEFAULT.group(1)}/20260923T000000Z/db.dump"
    done = subprocess.run(["git", "check-ignore", "-v", "--no-index", probe], cwd=REPO_ROOT,
                          capture_output=True, text=True)
    assert done.returncode == 0, f"{probe} is not ignored, so `git add -A` publishes a copy"


def test_the_build_context_excludes_a_copy_written_by_default():
    entries = {line.strip() for line in (REPO_ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
               if line.strip() and not line.strip().startswith("#")}
    assert DEFAULT.group(1) in entries, (
        f"{DEFAULT.group(1)} is missing from .dockerignore, so every build sends its copies to the daemon")
