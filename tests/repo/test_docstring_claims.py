"""Two claims a docstring makes that a machine can check.

Nothing else lints a docstring's *content*. Vale reaches the prose once
`.vale.ini` names the code trees, but it checks vocabulary rather than truth:
it can flag `currently` and cannot know that `./start-node.sh` was deleted.

**No length floor.** The sweep on 2026-08-16 worked to a ten-line floor and one
agent reported that its own detector "missed every one of these -- an orphan is
usually the *shorter* of two stacked blocks". The two worst instances found by
hand were both short: a block asserting Redis is on 56379 stranded above the
block recording that hardcoded port as a defect, and a fixture docstring
contradicting a test three functions away.
"""

from __future__ import annotations

import pathlib
import re
import posixpath
import subprocess

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

#: The trees whose comments make citations worth resolving. `app/` is a retired
#: corpus being deleted and is not swept.
TREES = (
    'server/src/', 'server/test/', 'server/e2e/', 'server/scripts/',
    'ui/src/', 'tests/', '.claude/scripts/', '.claude/hooks/', '.claude/tests/',
)

#: A backticked path with a real extension. Not bare words: `model.ts` alone is
#: a citation, `id` is not.
def is_a_host(cited: str) -> bool:
    """A registry URL is not a path in this tree, and reads exactly like one.

    `reui.io/r/base-nova/dialog.json` matches the citation pattern in full.
    **No directory at the root of this repository has a dot in its name** --
    `assets`, `docker`, `openspec`, `packages`, `scripts`, `server`, `tests`,
    `tools`, `ui`, and `.claude` after the leading dot -- so a first segment
    carrying one is a hostname rather than a directory.
    Checked rather than assumed: the loop below is what would otherwise send
    somebody to delete a correct reference.
    """
    head = cited.lstrip('./').split('/')[0]
    return '.' in head


CITED = re.compile(r'`(\.{0,2}/?[\w./-]+\.(?:ts|tsx|py|sh|mjs|mts|yaml|yml|json|conf))`')

#: A citation that exists to say the file is *not* there. Both are deliberate
#: and correct as written; a lint that fails them teaches people to delete the
#: sentence rather than the reference.
#: `would` covers the conditional case, which reads as a citation and is not
#: one: `tests/platform.py` *would* shadow the stdlib, and the whole point is
#: that nobody has created it.
ABSENT_ON_PURPOSE = re.compile(
    r'(never existed|does not exist|no such file|deleted|is gone|hypothetical|'
    r'was removed|retired|no longer|\bwould\b)', re.I)

#: Two files whose subject *is* a stale reference, so their fixtures are paths
#: that must not resolve. Exempted by name rather than by pattern: a pattern
#: broad enough to cover an invented path under the corpus would cover a real
#: mistake too.
FIXTURE_FILES = {
    '.claude/tests/test_stale_references.py',
    '.claude/tests/test_memory_audit.py',
    # Builds a whole synthetic checkout under `tmp_path` and names its files in
    # prose: the theme module it mentions is a fixture it creates, not a
    # citation of anything in this tree.
    '.claude/tests/test_knowledge_hook.py',
}

BLOCK = re.compile(r'/\*\*(.*?)\*/', re.S)


def tracked() -> list[str]:
    """Every file the tree has, committed or not.

    **`--others` too, or a citation added in the same change as the file it
    names fails.** `git ls-files` alone lists what is committed, so a new
    module and the comment pointing at it are both invisible until they land --
    which is exactly when somebody runs this.
    """
    listed = subprocess.run(['git', 'ls-files'], cwd=REPO_ROOT,
                            capture_output=True, text=True, check=True).stdout.split()
    fresh = subprocess.run(['git', 'ls-files', '--others', '--exclude-standard'],
                           cwd=REPO_ROOT, capture_output=True, text=True,
                           check=True).stdout.split()
    return listed + fresh


def swept(files: list[str]) -> list[pathlib.Path]:
    return [REPO_ROOT / f for f in files
            if f.startswith(TREES) and f.endswith(('.ts', '.tsx', '.py'))]


def resolves(cited: str, known: set[str], *, near: str = '') -> bool:
    """Whether a citation names a file the tree has.

    **By suffix, because a citation is written from where the reader is.** This
    codebase's house style is `report/freeze.ts`, not `server/src/report/freeze.ts`.

    An earlier version also required the first segment to be a *top-level*
    directory, on the argument that it kept the check off placeholder names. It
    kept the check off almost everything: measured over the swept trees, 117
    citations were examined and **204 skipped** -- `api` 33, `db` 26, `domain`
    24, `collections` 13, `report` 11. None of those is a top-level directory,
    and `api/model.ts` is the case the test above names as the one it resolves.
    """
    if cited.startswith('/'):
        return True  # a route, not a file -- `/api/openapi.json` is served, not stored

    # **A `../` citation is relative to the file that wrote it**, so it is
    # resolved against `near` rather than searched for by suffix. Treating it
    # as a suffix asks whether some file ends in `../x.ts`, which nothing does.
    if cited.startswith('../') and near:
        landed = posixpath.normpath(posixpath.join(posixpath.dirname(near), cited))
        return landed in known
    # `removeprefix`, not `lstrip`: `lstrip` strips *characters*, so
    # `.claude/scripts/x.py` became `claude/scripts/x.py` and matched nothing.
    # Every dot-directory in the tree was invisible to this check.
    bare = cited.removeprefix('./')
    if '/' not in bare:
        return True  # a bare filename is a name, not a path to anywhere
    if '...' in bare:
        return True  # an elided path in prose
    return bare in known or any(f.endswith('/' + bare) for f in known)


def test_a_citation_written_from_the_reader_resolves() -> None:
    """The predicate itself, because the sweep cannot show what it skipped.

    A whole-tree sweep that examines nothing reports exactly as clean as one
    that examines everything, which is how the gate above survived: green.
    """
    known = {'server/src/report/freeze.ts', 'ui/src/api/model.ts'}

    assert resolves('report/freeze.ts', known), 'the house style must resolve'
    assert resolves('api/model.ts', known), "the test's own worked example"
    assert resolves('server/src/report/freeze.ts', known), 'a full path still resolves'
    assert not resolves('report/no-such-file.ts', known)
    assert not resolves('api/gone.ts', known)
    assert resolves('freeze.ts', known), 'a bare name is not a citation'
    assert resolves('/api/openapi.json', known), 'a route is served, not stored'
    assert resolves('.claude/scripts/x.py', {'.claude/scripts/x.py'}), 'a dot-directory'

    near = 'ui/src/components/ui/input.test.tsx'
    tree = {'ui/src/features/auth/SignInForm.tsx'}
    assert resolves('../../features/auth/SignInForm.tsx', tree, near=near)
    assert not resolves('../../features/auth/Gone.tsx', tree, near=near)


def test_every_cited_path_resolves() -> None:
    """A comment naming a file that is not there sends the reader nowhere.

    Measured 2026-08-16 before this test existed: `./start-node.sh` was cited by
    `db/transaction-concurrency.test.ts` after being deleted, `csvImport.ts`
    from three files under a name it never had, and this session's own
    reorganisation broke two more by moving the Vale config test into a
    subdirectory.
    """
    files = tracked()
    known = set(files)
    dangling: list[str] = []

    for path in swept(files):
        rel = str(path.relative_to(REPO_ROOT))
        # This file's own examples are arguments to `resolves`, not citations.
        if rel in FIXTURE_FILES or rel == 'tests/repo/test_docstring_claims.py':
            continue
        text = path.read_text(errors='ignore')
        for line_no, line in enumerate(text.split('\n'), 1):
            for cited in CITED.findall(line):
                if is_a_host(cited):
                    continue
                if resolves(cited, known, near=rel):
                    continue
                if ABSENT_ON_PURPOSE.search(line):
                    continue
                dangling.append(f'{rel}:{line_no} cites {cited}')

    assert not dangling, (
        'these comments name a file that is not in the tree -- repoint or '
        'delete them:\n  ' + '\n  '.join(sorted(dangling)))


def test_no_comment_block_documents_another_comment_block() -> None:
    """A block whose next line opens another block documents nothing.

    It reads correctly in review and is wrong on the page: the subject is
    whatever declaration follows the *second* block. Fifteen were found by hand
    on 2026-08-16, nine in the auth surface alone, and one contradicted the
    block directly beneath it about which Redis port a worktree uses.

    **The first block in a file is exempt.** A file header sitting above the
    imports and then above the first declaration's own block is house style
    here, and one agent measured 45 of 47 stacked blocks to be exactly that.
    """
    orphans: list[str] = []

    for path in swept(tracked()):
        if path.suffix == '.py':
            continue  # Python docstrings attach syntactically; there is no stacking.
        text = path.read_text(errors='ignore')
        rel = str(path.relative_to(REPO_ROOT))
        lines = text.split('\n')

        for index, match in enumerate(BLOCK.finditer(text)):
            if index == 0:
                continue
            end = text[:match.end()].count('\n')
            for following in lines[end + 1:]:
                if not following.strip():
                    continue
                if following.lstrip().startswith('/**'):
                    orphans.append(f'{rel}:{end + 1}')
                break

    assert not orphans, (
        'each of these comment blocks is followed by another comment block, so '
        'it documents no declaration -- move it onto its subject:\n  '
        + '\n  '.join(sorted(orphans)))
