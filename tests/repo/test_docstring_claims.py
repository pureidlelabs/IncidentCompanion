"""Two claims a docstring makes that a machine can check.

Nothing else lints a docstring's *content*. Vale reaches the prose once
`.vale.ini` names the code trees, but it checks vocabulary rather than truth:
it can flag `currently` and cannot know that `./start-node.sh` was deleted.

**No length floor.** An orphan is usually the *shorter* of two stacked
blocks, so a detector with a floor misses the ones that matter -- a one-line
claim stranded above the block that contradicts it reads correctly in review
and documents nothing on the page.
"""

from __future__ import annotations

import json
import pathlib
import re
import posixpath
import subprocess

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

#: The trees whose comments make citations worth resolving.
TREES = (
    'server/src/', 'server/test/', 'server/e2e/', 'server/scripts/',
    'ui/src/', 'tests/', '.claude/scripts/', '.claude/hooks/', '.claude/tests/',
)

#: A backticked path with a real extension. Not bare words: `model.ts` alone is
#: a citation, `id` is not.
def is_a_host(cited: str) -> bool:
    """A registry URL is not a path in this tree, and reads exactly like one.

    `reui.io/r/base-nova/dialog.json` matches the citation pattern in full.
    **No directory at the root of this repository has a dot in its name**, once
    a leading dot is set aside, so a first segment carrying one is a hostname
    rather than a directory. Checked rather than assumed: the loop below is what
    would otherwise send somebody to delete a correct reference.
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

#: Files whose subject *is* a stale reference, so their fixtures are paths that
#: must not resolve. Exempted by name rather than by pattern: a pattern broad
#: enough to cover an invented path would cover a real mistake too.
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

    Requiring the first segment to be a *top-level* directory keeps the check off
    placeholder names, and off most citations besides: `api`, `db`, `domain`,
    `collections` and `report` all open a citation and none is a top-level
    directory. `api/model.ts` is the case the test above names as the one it
    resolves.
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
    # `.claude/scripts/x.py` becomes `claude/scripts/x.py` and matches nothing,
    # taking every dot-directory in the tree with it.
    bare = cited.removeprefix('./')
    if '/' not in bare:
        return True  # a bare filename is a name, not a path to anywhere
    if '...' in bare:
        return True  # an elided path in prose
    return bare in known or any(f.endswith('/' + bare) for f in known)


def test_a_citation_written_from_the_reader_resolves() -> None:
    """The predicate itself, because the sweep cannot show what it skipped.

    A whole-tree sweep that examines nothing reports exactly as clean as one
    that examines everything.
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

    A rename, a delete and a move each break a citation the same way, and none
    of them fails anything else.
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
    whatever declaration follows the *second* block, so the first can contradict
    it and nothing reads the two together.

    **The first block in a file is exempt.** A file header sitting above the
    imports and then above the first declaration's own block is house style
    here, and is almost every stacked pair in this tree.
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


def test_no_docstring_has_been_emptied_of_its_claim() -> None:
    """A `/**` closed by `*/` with nothing between them.

    A block comment holding no words documents nothing, and it is the shape a
    bulk rewrite leaves behind: the delimiters are structural, so the compiler,
    the linters and the prose gate all pass over the husk. A pass that rebuilds
    every block from its body lines empties a single-line docstring entirely,
    and every one of those gates stays green over the result.
    """
    empty: list[str] = []
    for tree in TREES:
        root = REPO_ROOT / tree
        if not root.is_dir():
            continue
        for path in root.rglob('*'):
            if path.suffix not in {'.ts', '.tsx'}:
                continue
            if 'node_modules' in path.parts or 'worktrees' in path.parts:
                continue
            lines = path.read_text(encoding='utf8', errors='ignore').splitlines()
            for number, line in enumerate(lines[:-1], start=1):
                if line.strip() == '/**' and lines[number].strip() == '*/':
                    empty.append(f"{path.relative_to(REPO_ROOT)}:{number}")

    assert empty == [], (
        f"{len(empty)} docstring(s) hold no words. Restore the claim or delete "
        f"the block: {empty[:10]}"
    )


#: A backticked identifier shaped like code rather than like a word: camelCase,
#: PascalCase carrying a second capital, or SCREAMING_SNAKE. A single lowercase
#: word in backticks is usually a field being quoted, and asking it to resolve
#: flags most of them.
SYMBOL = re.compile(r'`([A-Za-z_$][\w$]*)`')
CODE_SHAPED = re.compile(r'^(?:[a-z]+[A-Z]|[A-Z][a-z]+[A-Z]|[A-Z_]{3,})[\w$]*$')
WORD = re.compile(r'[A-Za-z_$][\w$]*')

#: A line comment is read only where the opener starts the line. That loses a
#: trailing comment's citations, and it is what stops a `//` inside a string
#: literal from swallowing the rest of the line as prose.
LINE_COMMENT = re.compile(r'^\s*(?://|#)\s?(.*)$')
BLOCK_COMMENT = re.compile(r'/\*(.*?)\*/', re.S)
PY_DOC = re.compile(r'"""(.*?)"""', re.S)

#: Every other tracked file a symbol can be declared in.
DATA_SUFFIXES = ('.json', '.yaml', '.yml', '.sh', '.mjs', '.cjs', '.js', '.mts')

BASELINE_REL = 'tests/repo/cited_symbols_baseline.json'
BASELINE = REPO_ROOT / BASELINE_REL


def split_prose(text: str, python: bool) -> tuple[str, str]:
    """A file's comment text and its code text, as two strings.

    Citations are read from the first and resolved against the second, so a
    comment cannot satisfy its own citation.
    """
    prose: list[str] = []

    def lift(pattern: re.Pattern, src: str) -> str:
        def take(match: re.Match) -> str:
            prose.append(match.group(1))
            return '\n' * match.group(0).count('\n')
        return pattern.sub(take, src)

    code = lift(PY_DOC, text) if python else lift(BLOCK_COMMENT, text)
    kept: list[str] = []
    for line in code.split('\n'):
        found = LINE_COMMENT.match(line)
        if found:
            prose.append(found.group(1))
        else:
            kept.append(line)
    return '\n'.join(prose), '\n'.join(kept)


def cited_symbols() -> tuple[dict[str, list[str]], set[str]]:
    """Every code-shaped citation with where it is written, and what the tree declares."""
    files = tracked()
    declared: set[str] = set()
    cited: dict[str, list[str]] = {}

    for path in swept(files):
        rel = str(path.relative_to(REPO_ROOT))
        prose, code = split_prose(path.read_text(errors='ignore'), path.suffix == '.py')
        declared.update(WORD.findall(code))
        if rel in FIXTURE_FILES or rel == 'tests/repo/test_docstring_claims.py':
            continue
        for line_no, line in enumerate(prose.split('\n'), 1):
            if ABSENT_ON_PURPOSE.search(line):
                continue
            for name in SYMBOL.findall(line):
                if CODE_SHAPED.match(name):
                    cited.setdefault(name, []).append(f'{rel}:{line_no}')

    for rel in files:
        # The baseline is a list of names that do *not* resolve, so reading it
        # as a source of declarations would make every entry satisfy itself.
        if rel == BASELINE_REL or not rel.endswith(DATA_SUFFIXES):
            continue
        if (REPO_ROOT / rel).is_file():
            declared.update(WORD.findall((REPO_ROOT / rel).read_text(errors='ignore')))
    return cited, declared


def test_prose_and_code_are_told_apart() -> None:
    """The split itself, because the sweep cannot show what it put on which side."""
    prose, code = split_prose('/** cites `Alpha` */\nconst Beta = 1 // and `Gamma`\n', False)
    assert 'Alpha' in prose and 'Alpha' not in code
    assert 'Beta' in code and 'Beta' not in prose
    # A trailing comment stays on the code side, which is the known blind spot.
    assert 'Gamma' in code

    prose, code = split_prose('def f():\n    """cites `Alpha`"""\n    return Beta\n', True)
    assert 'Alpha' in prose and 'Beta' in code and 'Beta' not in prose

    # A `//` inside a string is code, and the line is kept whole.
    _, code = split_prose('const u = "https://x/y"\n', False)
    assert 'https' in code


def test_every_cited_symbol_resolves() -> None:
    """A comment naming a symbol nothing declares sends the reader nowhere.

    The baseline holds the names this tree cites and does not own -- a Redis
    command, a provider's field, a library's option key. Adding a name to it
    claims no declaration is owed; the rest is a backlog to drain.
    """
    cited, declared = cited_symbols()
    baseline = set(json.loads(BASELINE.read_text()))

    dangling = sorted(n for n in cited if n not in declared and n not in baseline)
    assert not dangling, (
        'these comments name a symbol nothing in the tree declares -- repoint '
        f'them, or add the name to {BASELINE.name} if it belongs to something '
        'outside this repository:\n  ' + '\n  '.join(
            f'{n} ({cited[n][0]})' for n in dangling))


def test_the_baseline_holds_only_names_that_still_dangle() -> None:
    """An entry whose citation resolves, or is gone, exempts nothing and hides the next."""
    cited, declared = cited_symbols()
    baseline = set(json.loads(BASELINE.read_text()))
    stale = sorted(n for n in baseline if n in declared or n not in cited)
    assert not stale, (
        f'these names in {BASELINE.name} no longer dangle -- the citation '
        'resolves now, or it is gone. Remove them:\n  ' + '\n  '.join(stale))
