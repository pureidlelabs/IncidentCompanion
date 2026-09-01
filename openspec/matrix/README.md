# Coverage matrix

What the specifications require, against the controls the constitution grounds them in.

A file here maps requirements to one standard. Two things make it worth keeping, and neither is visible from a specification: which control nothing answers, and which requirement answers nothing.

**A row is written only where the control has been read.** An identifier recalled rather than looked up is worse than an empty cell, because an empty cell asks to be filled and a wrong one does not.

**`scenarios.md` is the other direction, and it is not a standard.** It answers the three numbers the constitution's quality gate requires — how many scenarios exist, how many are demonstrated, and how many are recorded as undemonstrable. It lives here because it is the same kind of thing: a claim about coverage that no single specification can carry, held true by a test rather than by care.

| Standard | File | State |
| --- | --- | --- |
| OWASP ASVS 5.0 Level 2 | `asvs.md` | mapped against the 5.0.0 requirement list; the chapters covered are named in the file, which is the copy to read |
| The quality gate's three numbers | `scenarios.md` | every scenario listed, held against the specifications by `tests/docs/test_scenario_ledger.py` |
| ISO/IEC 27002 | not started | |
| NIST SP 800-53 AU | not started | |
| CIS Benchmarks | not applicable here — checked against a running stack by tooling, never from a specification | |
