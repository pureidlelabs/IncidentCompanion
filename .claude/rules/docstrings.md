# Rules: docstrings say what, not why

*Read before writing a docstring or a comment. `rules/claim-homes.md` owns where a claim goes; this owns which of them a docstring may hold, which is almost none.*

**A docstring documents an interface. A comment explains a line. Everything else is knowledge, and knowledge has a store.**

| | Holds | Shape |
| --- | --- | --- |
| **Docstring** | what this does, how to call it, what it takes, what it returns | `"""…"""`, `/** … */` |
| **Comment** | why *this line* is not what it looks like | `#`, `//` |
| **The specification** | what the behaviour must be, and why it is achieved this way | `openspec/` |

→ <https://utrechtuniversity.github.io/workshop-computational-reproducibility/chapters/comments-and-docstrings.html>

**A docstring is read by whoever opens the file, and the argument is wanted by whoever is deciding what to build.** Those are different moments and usually different people, and the specification is the one read before the work starts.

## The order it is written in

**Writing the docstring first is what makes it long, and no amount of care at the moment of writing fixes that.** Working something out produces understanding; if the docstring is the first prose available it takes all of it, and the note and the commit message are then written *from* the docstring rather than instead of it. Nothing sends anybody back to cut the first copy.

So the docstring is written **last**, and the draft goes somewhere that is not a file in this repository -- the job's scratch directory. From there each sentence goes to exactly one of:

| | |
| --- | --- |
| **A specification, a design record, a test** | the behaviour, the rejected alternative, the claim. `rules/claim-homes.md` owns the order |
| **The commit message** | what changed, why it changed, and the measurement that decided it |
| **The docstring** | what a caller needs that none of those give them |

**Scratch dies with the job**, so it is a staging area and never a destination.

## Write it by subtraction, and there is no budget

**The behaviour is already stated in the specification**, and the reason it is achieved this way in the design record beside it. So the docstring is the residue: what is left once you assume the reader has both.

**There is no length budget.** The question is never *how much may this be* but *what does this say that the note does not*.

## What a docstring holds

The first line is the claim: what this is, in one sentence. Then only what a caller cannot see from the signature.

- **The contract** — what it does, what it takes, what it returns, what it raises.
- **A precondition the types do not carry.** *Call after `flush`*, *the path must already exist*.
- **A consequence outside the return value.** It writes, it evicts, it locks.

## What a docstring does not hold, and where it goes

Each of these is knowledge. Move it; do not shorten it.

| In a docstring today | Home |
| --- | --- |
| why this way and not the obvious way | the capability's **`design.md`** |
| a rejected alternative | the capability's **`design.md`** |
| a measured number — `2.59:1`, `~376ms`, `83px` | the **commit message** that acted on it |
| what the test cannot see | the **test's** own docstring, next to the assertion |
| a claim a test already asserts | **nowhere** — name the test and stop |
| a status report on another module | **nowhere** — it goes stale unread |
| the route to the answer, how it was found | **nowhere** |
| history, dates, what changed | the **commit message** |

**Anything derivable by reading the code goes nowhere at all.** Regenerate it when somebody wants it.

## Writing it

- **Write for a caller who has not read the rest of the project** — somebody deciding whether this function is the one they want.
- **Say the thing rather than announcing it.** No *this is important*, no *worth noting*, no first person.
- **No glossary.** A name a reader can follow by opening the file it names needs no expansion.
- **One cross-reference, not three.**
- **A changed function owes its docstring the same change, in the same commit.** Nothing catches a docstring that stopped being true — which is the whole reason the rest of this file is about not writing what needs maintaining.
- **Match the file you are in.** Where two shapes would both do, the one already used wins.

## Comments

Same test, one line lower. A comment earns its place when the code reads as a mistake without it — a guard that looks redundant, an order that looks arbitrary, a constant that looks arbitrary.

**Never** a restatement of the line, a commented-out block, or a date.

## The instruments

The **`docstring-economy` skill** while writing, and the **`docstring-freshness` skill** over a diff. Neither is a linter.

**Two mechanical checks do exist, and they are the two that can be right.** `tests/repo/test_docstring_claims.py` refuses a comment citing a path that does not resolve, and one documenting another comment block rather than a declaration. Both are structural: neither reads the prose.
