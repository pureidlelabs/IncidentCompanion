---
name: docstring-freshness
description: Check whether a docstring's claims about the repository are still true — the paths it names, the modules it points at, the fields it calls by an old name. Use over a finished diff, or when a docstring cites something you have just moved or renamed. Its sibling `docstring-economy` asks whether a line is worth its space; this asks whether it is still correct, which is the failure that sends the next reader to a file that no longer exists.
---

# Docstring freshness

**`docstring-economy` asks whether a line is worth its space. This asks whether it is still true.**

The two fail differently and are found differently. Padding is a judgement call with no test — that is why that skill has none. Staleness is a *claim about the repository*, and the repository can be asked. Hence a script.

A stale docstring is worse than a padded one. Padding wastes a reader's time; a stale claim sends them to a file that does not exist, or tells them a field is called something it has not been called since v5, and they act on it. `test_sentinel_client.py` said it tested `app/sentinel_client.py` for however long it had been since that module moved into `app/plugins/sentinel/`.

## Running it

```bash
python3 .claude/skills/docstring-freshness/check.py .

python3 .claude/skills/docstring-freshness/check.py . --quiet      # counts
python3 .claude/skills/docstring-freshness/check.py . --only PATH  # one check
```

Exit status is 1 if `PATH` or `LINEREF` found anything — those two are the near-zero-noise pair, so they are the only ones safe to gate on. `SYMBOL` and `PHRASE` report candidates and always want a human.

## The four checks, and how much to trust each

| check | noise | what it catches |
| --- | --- | --- |
| `PATH` | ~none | a file named in a docstring that does not exist |
| `LINEREF` | ~none | `models.py:240` past EOF, or pointing at a blank line |
| `PHRASE` | high | a claim contradicted by what the module actually does |
| `SYMBOL` | high | a backticked name nothing defines and nothing writes |

**`PATH` is the one that pays.** Every hit in the first run was real: eleven modules said "Split out of the former `tests/test_e2e.py`", two named `app/sentinel_client.py` and `app/sentinel_mapping.py` after both moved into the plugin package, and three named `app/picker.py` after it became a directory. **A module becoming a package is the commonest cause** — the same hazard that catches the four non-recursive globs, arriving through prose instead of through a filter.

## Reading `SYMBOL` without being fooled

Most of what it reports is correct prose about *removed* code, and that is the expensive content the economy skill tells you to keep. `TACTIC_TO_KILLCHAIN`, `adopt_browser_theme`, `_preview_clear` and `editing_theme` are all named deliberately, by docstrings explaining what replaced them. **Do not "fix" those.** The question is never "does this name exist" but **"is this docstring claiming it exists *now*"**.

Four false-positive classes are already suppressed, and the last one is what took the check from 43 hits to 27:

- names defined anywhere as a `def`/`class`/assignment/argument/attribute;
- module stems, so `casedb.write_case` resolves;
- anything appearing as a **string literal** anywhere in the repo — dict keys (`footer_row`, `edit_row`), SQL columns (`case_meta`), env vars (`INCIDENTCOMPANION_PLUGINS`), CSS classes, theme names (`synth_wave`);
- tokens that read as English rather than as code.

What survives and is still noise: third-party names (`get_swagger_ui_html`), deliberately hypothetical ones (a "`search_timeline`-shaped tool"), and placeholders (`_helper`).

## `PHRASE` is the extensible one

`CLAIMS` in `check.py` pairs a docstring pattern with counter-evidence in the module's own source. Two ship:

- **`case.json` in a module that reads `case_meta`.** Mostly legitimate — the `.iccase` archive really does carry `case.json`, so `export_case` and `_load_case_from_json` are correct. The real finding was `list_case_summaries`, whose docstring described reading "their full case.json files" while the body reads `case_meta` out of `case.db`. **A storage migration is exactly the change a type checker cannot see and a test will not fail on.**
- **`event_type` / `killchain` in a module that knows `event_source` / `tactic`.** Same shape: v5 renamed both, and history that *names* them is correct while a live claim is not. `field_specs._select_defaults` was telling the reader that `event_type` and `killchain` "declare `""` and still open on their first option" — a statement about fields that no longer exist.

**Add a claim when a rename outruns the compiler.** A vocabulary value, a column, a file format, an env var: anything where the old name still parses.

## Lessons

Kept here because each cost a cycle, and the next person will otherwise pay it again.

- **Check what the docstring *claims*, not what it mentions.** The first draft flagged every mention of a removed symbol and was unusable: the repo's best docstrings are largely about removed alternatives. Distinguishing needs the surrounding sentence, which is why `SYMBOL` and `PHRASE` are advisory and `PATH` is not.
- **String literals are the single highest-value suppression.** Without them every dict key, SQL column and env var is a finding. It is also the fix that generalises: a name can be real without being an identifier.
- **A rewriter keyed on line numbers goes stale between batches.** Editing one docstring shifts every line below it, so a second spec written against the original survey silently targets the wrong node — or errors, if you are lucky. Key on the node's *name*, and let it refuse an ambiguous one.
- **Re-wrapping a docstring must dedent first.** The stored value carries the node's own indent on every line but the first. Reflowing without stripping it makes every block look indented, so a structure check claims all of them — and re-adding the indent on a block that kept its own double-indents it.
- **`""[:0].isspace()` is `False`.** A dedent guarded by it strips *all* leading whitespace at column 0, which is every module docstring — flattening the `.iccase` format table and the API route listing. Take `line[min(leading, col):]` instead: at most `col`, never content.
- **A list under a lead-in line is still a list.** "Two layers get themed:" above a `1.`/`2.` pair looks like a paragraph to a check that only inspects the first line, and the markers get run into the prose. Split the block at the first marker.
- **An idempotency assertion is the cheap oracle for a reflow.** `f(f(x)) == f(x)` caught both table-flattening bugs above before either reached a file. Any rewriter worth running twice should refuse to run once if it fails.
- **Verify a docstring sweep changed no code.** Strip every docstring from both revisions, compare the ASTs, and say so in the commit message. It costs ten lines and turns "should be safe" into "is byte-identical in all 60 files".
- **A gate that cannot reach zero is a gate nobody reads.** One docstring legitimately named a since-deleted module while explaining that path-shaped assumptions go stale — correct, and permanently red. Rewording it to "the pre-split single-module path" kept the whole lesson and cost nothing, which is the right trade every time it is available. Reach for a suppression syntax only when it is not.
- **Counts drift with the thing they count.** `_select_defaults` said "two are required" of a four-field list; v5 made it three, and the sentence stayed because renaming the *fields* was the visible half of that change. Whenever a check turns up a stale name, read the numbers in the same sentence — the checker cannot, and they are wrong for the same reason.

## What this cannot do

- **Prose that is simply wrong.** "The lock is per case" when it is per session names nothing checkable. Only reading catches that.
- **Numbers.** "1,875 lines", "~376ms", "2.59:1", "eight entity pages" — the most valuable content in these docstrings and entirely unverifiable from here. A count that has drifted looks exactly like one that has not.
- **Whether a kept explanation is still the *reason*.** `docstring-economy` reads for that; this reads for names.
