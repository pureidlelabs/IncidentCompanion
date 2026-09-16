# Scope

**The application assesses; the organisation reports.** It does not notify an authority and is not the record of having done so. Filing is an act with legal consequence taken by a named person under their own procedure, and putting a regulatory submission behind a button in an application that cannot know it was authorised is the wrong place for it.

**No threshold here is a judgement.** Every number, duration and monetary figure comes from the instrument that sets it and is traceable to the provision. A value somebody thought reasonable is not a threshold.

**Only the regimes that apply to the case are assessed.** Which those are is one of the organisation facts the case holds its own copy of.

**Reporting stage is not the case's state.** A case can be contained and still owe a final report, and can owe an intermediate one while the incident is live. One axis cannot say both.

**A readiness line hangs off a verdict, so it never asks for the answer that decides whether a regime is in play.** What a case is short of is reported for the regimes it is already in play for; the answer that brings one into play is asked on the form, not in the readiness surface. Giving that answer its own route is a second surface and a different product.

# Design

## Three outcomes, and the third is not the second

An assessment resolves to reportable, not reportable, or **not decidable on what the case records**.

The third is a distinct outcome with its own presentation, never folded into the second. A case that has not recorded whether personal data was involved is not a case where it was not: collapsing those is how a deadline passes while a screen reads as settled.

## An assessment is derived, never stored as a conclusion

An assessment is a reading of the case at a moment, computed from what the case records rather than saved as something somebody decided.

When a fact changes the assessment moves with it, and the analyst is told when a change moves an outcome — particularly towards something being owed. A stored conclusion would still read as true after the fact under it changed.

## The working is the output

An assessment names the regime, the article it rests on, and every criterion it weighed. Each criterion carries whether it is met, unmet or unstated, and the provision it comes from.

Which criteria decided the outcome is distinguishable from those that were weighed and did not. An analyst defending a decision needs the ones that carried it, not the whole list.

Where an instrument sets different thresholds by kind of organisation, the one applied is the one for that customer's kind, and which kind that is comes from the organisation facts rather than from the assessment.

## Stage is tracked alongside, on its own axis

Where a regime requires more than one submission over time, which have been made is tracked against the case as its own record, independent of the case's state and of the assessment's outcome.

An assessment says what is owed. The stage record says what has been done about it. Neither is derived from the other.

## An answer taken back is the absence of an answer

A question these instruments ask has three states, not two: answered one way, answered the other, and not answered. The third is a real state -- an assessment that cannot say which questions are still open cannot say what it is waiting for -- so it is stored, and what it is stored as is the absence of a value rather than a member of the vocabulary.

That is why a ground taken back is written as nothing at all. The vocabularies these fields offer are closed and the columns behind them hold their members and nothing else, so a value standing for *not stated* would have to be a member the vocabulary does not have. Offering the analyst a row that reads *not stated* is a separate matter: the form shows one, because a question nobody has answered still needs somewhere to be answered from and somewhere to be taken back to. What the screen draws and what the record holds are not the same list.

**What decides the stored form is the schema, not the control.** A field's blank is derived by asking the schema what it accepts -- null first, then absence, then an empty value where the schema supplies one -- so a field that changes shape changes its blank with it. A screen that decided the same thing from the kind of control it happens to draw would hold a second opinion about every field, agreeing until one of them stopped being nullable and disagreeing silently after.

## A figure a regime asks for is stored wide enough to hold the answer

The quantities an assessment weighs are stored so that no real answer is refused by the width of the column holding it. A 32-bit integer stops at 2,147,483,647, and Postgres refuses a larger write rather than truncating it, so a column of that width decides the answer instead of recording it.

That ceiling falls inside the answers these instruments ask for. It is below the turnover by which NIS2 sizes an essential entity, and below the number of accounts a single breach has reached. The entities the questions are asked of are the ones above the line, which is what makes the width a correctness property rather than a capacity estimate.

Whether the ceiling is reachable is what decides the width, not whether a regime asks for the figure. A duration in minutes is asked for by the same instruments and cannot approach it, so it is not stored wide; the same question asked about a count of people or a sum of money can.

A figure is held to what the install can read back, and the column is where that is enforced: the validation above it is reached by the screens and not by an archive coming in. What a figure past that point costs depends on the read -- a record the install parses on the way out stops answering, and a collection row, which travels through a loose envelope, is drawn with the altered number and says nothing. The ceiling is the largest integer the read carries exactly, narrower than the column type and stated once; the floor is zero, which every schema above these columns already requires.
