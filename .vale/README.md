# The docs linter

`vale` over `docs/` and `README.md`, with three rules from the `writing-docs` skill.

```bash
vale docs README.md
```

Vale is not installed by this repository — `brew install vale`, or the [release binary](https://github.com/errata-ai/vale/releases). The npm wrapper `@vvago/vale` works too, but its whole function is a `postinstall` download, which this repo's npm policy blocks by default.

## Advisory, not a gate

**Do not put this in `test.sh` or CI**, on the evidence below.

Measured over the rewritten `docs/` on 2026-08-16: four alerts, two of them real. Both false positives were the rule matching **the app's own vocabulary** — `*What we found*` and `*What we did*` are section-group labels in the report editor, and Vale cannot know they are quoted UI strings rather than a narrator saying "we". That class recurs for as long as the docs quote the interface, which is forever.

A gate that fires on correct prose gets exceptions added until it means nothing. An advisory command that is right half the time is worth running.

## Which rules survived, and why

**Re-measured 2026-08-16 after the glob was found wrong.** The first numbers here were taken with `[docs/**.md]`, which matches nothing below `docs/` -- so "the rules were measured" meant two files out of twenty, and "`InternalNames` has never fired" was an artefact of it never having been run. `[docs/**/*.md]` is the spelling that walks the tree.

With the glob fixed: **0 errors in 20 files.** Verified as awake rather than inert by planting one violation per rule:

| Rule | Level | Planted | Fired |
| --- | --- | --- | --- |
| `Justification` | `error` | `, deliberately:` in a sentence | yes |
| `MediumHeadings` | `error` | a section called `## Overview` | yes |
| `InternalNames` | `warning` | `` `ic_app` `` in backticks | **no** |
| `InternalNames` | `warning` | `ic_app` bare in prose | yes |

**`InternalNames` cannot see the spelling it was written for.** Vale skips code spans, and every internal name in these pages is backticked -- so it catches the rarer, worse case (a bare `ic_app` reading as an English word) and never the common one. Keep it for that, and do not claim it guards the backticked form.

`FirstPerson` was dropped: it fired twice, both on the report editor's own section labels (*What we found*), which Vale cannot tell from a narrator.

## Two traps if you write another rule

**`nonword: true` or a token starting with punctuation matches nothing.** `existence` wraps each token in word boundaries by default, and `\b` before a comma never holds. The failure is silent and reads as clean docs — measured: a tuned rule set found *fewer* alerts than the untuned one, and both genuine hits disappeared.

**Anchor a heading rule to the whole heading.** A format word is often part of a proper noun.

## What it cannot do

Whether a sentence is **true**. Every serious error in the pages this replaced was a true-sounding statement about the wrong thing — import living in the wrong screen, a graph described as drawing something it does not. Vale passes all of them. That is what the grounding pass and an occasional agent audit are for.
