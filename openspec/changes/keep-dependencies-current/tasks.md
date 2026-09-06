# Tasks

Tasks already satisfied are marked complete with what demonstrates them. The remainder is outstanding.

## 1. Discovery, policy and the standing record

- [x] 1.1 A record naming what is adopted, what is available and what is held, answerable without reading the tree. Demonstrated by the dependency dashboard issue, which lists pending, held and detected dependencies and is rewritten on every run.
- [x] 1.2 An observation period applied to unattended adoption and recorded where the policy is stated. Demonstrated by `security:minimumReleaseAgeNpm` in `.github/renovate.json5`.
- [x] 1.3 A published vulnerability offered without waiting out that period. Demonstrated by the `vulnerabilityAlerts` block overriding the period, and by OSV being read directly rather than through platform alerts.
- [x] 1.4 Dependencies that move together offered together. Demonstrated by the maintained monorepo and linter groupings, plus the one local group for the ORM and its kit, which the maintained data does not cover.
- [x] 1.5 A version crossing a compatibility boundary held for a person's decision rather than raised as work. Demonstrated by majors resting under Pending Approval on the dashboard.

## 2. Holds

- [ ] 2.1 Record each held dependency with the constraint that holds it and the condition that would release it, in a form a check can read. Verify by reading the record back and finding the constraint named, not just the outcome.
- [ ] 2.2 Add a check that fails when a hold's stated condition no longer applies, so a hold cannot outlive its reason. Verify by mutating the recorded constraint to one the installed package already satisfies and watching the check go red; confirm the mutation reached the file before trusting the result.
- [ ] 2.3 Record that the two known holds share one constraint and are released together. Verify that the record shows the relationship rather than presenting them as unrelated.

## 3. Traceability

- [ ] 3.1 Identify the OWASP ASVS 5.0 controls covering dependency management and vulnerable components, by reading the published standard rather than recalling identifiers. Verify each identifier resolves in the standard before it is written down.
- [ ] 3.2 Add those controls to `openspec/matrix/asvs.md`, mapped to the requirements in `specs/dependencies/spec.md`. Verify the matrix traces every requirement carrying a security property.
- [ ] 3.3 Record any identified control that nothing answers as a deviation in the constitution's register, with the reason and what would change it. Verify no identified control is left neither traced nor recorded.

## 4. Demonstration

- [ ] 4.1 Correct the account of stack-gated tests in `verify.sh`, which names a pattern matching no file and a count that has drifted. Verify by searching for the pattern the comment cites and for the one actually used, and by counting both.
- [ ] 4.2 Make an undemonstrated verification distinguishable from a passing one at the point a dependency change is judged, so a skipped tier cannot read as a pass. Verify by running with the stack down and confirming the outcome is reported as undemonstrated and names the tier.

## 5. Reproducibility

- [ ] 5.1 Decide whether the container components are pinned by digest here or in a following change, and record the decision. This is the second open question in `design.md`.
- [ ] 5.2 If pinned here: identify every component named by a moving tag and pin it by digest. Verify by building one revision twice and comparing the resolved versions of every component.
