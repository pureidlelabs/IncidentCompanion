# Rules: how prose reads, wherever it is written

*Read before writing anything a person will read: a reply, a docstring, a commit body, a specification, a skill. `rules/docstrings.md` owns what a docstring may **hold**; this owns how any of it **reads**.*

**Most of this is enforced by Vale over `openspec/` and `.claude/`.** The rules are in `.vale/styles/`, the scoping is `.vale.ini`, and `tests/docs/test_vale_config.py` holds them awake. Run it before landing prose:

```bash
npm run lint:prose      # the paths are in package.json, not restated here
```

**Run it from the repository root, and never `vale <path>` from a subdirectory.** Every section heading in `.vale.ini` is a path glob anchored at the root -- `[ui/src/components/ui/*.tsx]` and the rest -- so `vale src/components/ui/` run from `ui/` matches no section, applies no style, walks every file and reports zero errors — and the clean answer is the one that looks like success. It is the silent-scope trap `CLAUDE.md` records for `.mdx`, arriving through the working directory instead of the extension.

**A clean Vale run is only evidence when the file count is one you expected.** That is the tell in both forms: 0 files walked, or files walked under no section.

Vale is installed in the devcontainer image (`.devcontainer/Dockerfile`, version and SHA256 pinned there). Outside it, `brew install vale` — the project checks in `.vale.ini` and `.vale/styles/`, never the binary.

## Where the rules reach, and where they do not

| Surface | Instrument | Rules |
| --- | --- | --- |
| `README.md` | Vale | `Shared` + `IncidentCompanion` |
| `openspec/` — the specifications | Vale | `Shared` |
| `.claude/` — notes, `rules/`, `skills/`, `CLAUDE.md` | Vale | `Shared` + `KnowledgeBase` |
| The API document — Zod `.describe()`, Nest `summary:`/`description:` | `tests/docs/test_api_prose.py` | `Shared` |
| Interface copy — labels, placeholders, empty states, errors | `tests/docs/test_ui_copy.py` | `Shared` + `Interface` |
| Docstrings and comments in `server/`, `ui/` | Vale, once `.vale.ini` names them | `Shared` |
| The reply in the terminal | **nothing** | — |

**Vale lints source-code comments natively**, TypeScript and Python included, once `[formats]` maps the extension to `md` and a section selects it. → <https://docs.vale.sh/formats/code>

**`Directional` needs narrowing before the source-comment section lands.** Most of its hits are `as above` inside a test file, meaning the line above rather than a place on a page — correct there, and the rule was written for a cross-reference in prose.

The API document and interface copy stay linted by tests rather than by Vale, because both are *values* rather than comments — a Zod `.describe()` string is not in a comment scope. Each loads `.vale/styles/*/*.yml` rather than restating it, so narrowing a rule narrows it everywhere at once.

**`Interface` is EUI's content guide, and the same third of it survived.** American spelling is inverted here as before; `choose` is scoped to the picking sense, because *Choose a password* is creation and *Select a password* is not English; `click` stays, being correct where the mouse is the point. What transferred whole is the error-message tone — no `Oops`, no *Something went wrong*, no apology, no blaming the reader — plus device-agnostic verbs and `via`/`etc.`. → <https://eui.elastic.co/docs/content/>

**Demo case content is not interface copy**, and `test_ui_copy.py` excludes it. An analyst writing *"mailbox read in bulk via Graph API"* into a timeline is writing their own record; the product's voice rules stop at the chrome. The same exclusion is in `test_api_prose.py`.

### What EUI's patterns settled, so nobody re-derives it

- **An error *screen* owes three parts: what happened, why, what to do.** The React error pages follow it.
- **An API `description` owes none of them, and conflating the two was a real mistake here.** It is a reference entry read by somebody writing a client, in Redocly or in generated code — so it names the condition that produces the status and the field that discriminates it, and gives no advice. *"Wait and retry"*, *"contact your administrator"* and anything reassuring are screen copy, and `invalid` is the correct word for a malformed body.
- **Never apologise, and say what survived.** EUI's own 500 example opens *"Sorry, there's a problem with the application"*. `RouteError` says *"The case is untouched — nothing is written while a screen is drawing"*, which is the better answer during an incident and is the standard here.
- **The severity vocabulary does not move.** EUI's scale is unknown/good/neutral/warning/risk/danger, for infrastructure health. This product's is `critical/high/medium/low/informational`, which is what an MXDR analyst uses, and the GDPR bands are **ENISA's** and not ours to rename. EUI permits *"alternative, customised variations in terms of words and naming"*. Their colour *ordering* is the half that transfers, and that is `visual-check`'s business rather than this file's.
- **A bare `Create` in a dialog footer stays**, because the dialog title names the object. EUI's rule — `create` "always followed by an object" — targets a button standing alone in a toolbar.

**The reply in the terminal is where most of this project's prose is produced, and nothing can lint it.**

## The five that change every sentence

- **Second person, present tense, active voice.** *You configure settings from the actions menu*, never *settings can be configured*. The passive hides who acts, and in a multi-user app that is the one fact a sentence must keep.
- **Say the thing instead of announcing it.** *Worth knowing:*, *importantly*, *note that*, *it cannot be overstated* — all of them spend a clause on the claim's rank rather than the claim.
- **A shorter form exists for most of it.** *in order to* → *to*. *due to the fact that* → *because*. *has the ability to* → *can*. *utilize* → *use*.
- **Nothing relative that a reader cannot resolve.** *currently*, *recently*, *last month*, *the section below* all depend on when or where they were read. Name the version, the date, or the section.
- **No filler adverb in front of a verb.** *simply run*, *just click*, *it is easy to* — each one tells a reader who is stuck that they should not be.

## Word choice, after measuring which transfer

Elastic's list is the source and **most of it does not survive contact with this repository**.

| Their rule | Here |
| --- | --- |
| American spelling | **Inverted.** This tree is British, including inside identifiers. |
| Ban `-ize` spellings | **Dropped.** Every stem is a live symbol: `Authorization`, `normalizeTactic`, `ZodSerializerInterceptor`. |
| Ban `master` | **Narrowed to the git sense.** `customer master table`, the compliance `master switch` and the `master/detail` pattern all stay. The default branch is `main`. |
| Ban `easy`, `simple` | **Narrowed to the adverb.** *Things that are easy to get wrong* means *these are traps*. |
| Ban `click` | **Narrowed.** Correct where the point is the mouse — *middle-click a title into a new tab*. |
| Ban `please` | **Narrowed to the imperative.** *other (please specify)* is a form asking the analyst for something. |
| `whitelist` → `allowlist` | **Kept**, with `blacklist`, `sanity check`, `dummy`, `grandfathered`. |
| No `click here` link text | **Kept.** A link is read out of context by a screen reader. |
| No `e.g.` / `i.e.` | **Kept.** Guessed at by a reader whose first language is not English. |
| No directional reference | **Kept**, for cross-references only — *a band above the table* describes where a control renders. |

**The pattern is the transferable part, not the table.** A word-level ban is a claim about how this codebase uses a word, and that claim is testable: grep the tree for the word and read the hits before writing the rule.

## Three that are this project's, not theirs

- **One line per paragraph in every `.md` file.** Do not hard-wrap. `Shared.HardWrap` refuses it, and `scope: raw` is the reason it can: every other Vale scope is the HTML it renders first, where the newline is already gone. **A sample inside a fenced block is not exempt from the rule's reach** — raw scope bypasses `BlockIgnores` and the inline `<!-- vale ... = NO -->` comment both, so a fenced example that trips it gets rewritten rather than exempted.
- **No emoji.** Not in prose, headings, commits or UI copy. A style guide recommending them is not a reason.
- **A directive is a project rule and never a fact about a person.** Employment, nationality, budget, direct quotes and readings of how somebody behaves stay out of the tree whatever else would house them. → `CLAUDE.local.md`
