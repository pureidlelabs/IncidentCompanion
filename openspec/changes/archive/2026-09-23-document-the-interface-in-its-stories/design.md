# Scope

**This settles where a part's documentation lives and what it is for, not how any one part behaves.** A defect found while combing is its own change; this one adds no behaviour.

**Coverage is not the measure and is not sought.** A test is written because it can catch something. What is worth catching becomes clearer as more are written, so this record is added to while the work runs rather than settled at the start.

**The bar is applied to every tier at once, and is red where the work has not reached.** The remaining count is the backlog. A list of exempted files hides exactly the entries somebody has to open next.

**A decision already taken in the code is not thereby correct.** Where combing finds behaviour nobody chose, it is recorded as open rather than written up as intended.

# Design

## Documentation lives in the source the page is generated from

The gallery builds a part's page from three things: the block above its metadata, the block above each of its stories, and a table generated from its types. All three are read from the source, so a property documented where it is declared is documented once.

That is also what an agent receives. The documentation server hands back the same assembly already structured, so what is written for a person is what is read by a tool.

**A sibling file is refused.** It carries the same claims where the types do not reach it and no linter walks it, and it is the second description that drifts. Measured: the prose linter walked **0 files** when pointed at one, because the extension appears in no section of its configuration -- and its summary counts files walked, so it reported clean.

## What a part's documentation holds

The residue, once the reader is assumed to have the generated table in front of them.

- What the caller must supply that the part cannot derive.
- What the caller may not assume, where the obvious assumption is wrong.
- Which of two similar parts to reach for, and when.

It does not hold the argument for why the part is built this way. That is a design record, and a caller choosing between two parts is not the reader for it.

## What a demonstration is worth

A demonstration is worth writing when it can fail for a reason a reader could not see.

The interface's own jsdom tier gives every element a zero box and renders no overlay into the document, so anything about size, spacing, focus order, computed colour or a portalled surface is invisible there and passes. Those are exactly the claims a part's prose tends to make, and exactly the ones nothing checked.

**A demonstration is confirmed by breaking what it covers**, and the break is confirmed to have landed. A mutation that silently fails to apply leaves the demonstration green and reads as proof.

## A tier demonstrates its own layer and inherits the one beneath

A composition does not re-demonstrate the controls it is assembled from. That a button refuses a press, that a field announces its error, that a table skips a disabled row -- each is settled once, where the control is defined, and every composition above it inherits the answer.

What a composition owes is the part no control can know: **the relations between them, and what the whole produces.** An action offered while the value it acts on is refused; a control still live while a write is in flight; a second submission accepted before the first is answered; a total that disagrees with the rows it sums. None of those is visible from inside any one control, and all of them survive a tier of controls that each behave perfectly.

The same holds one level up. A screen does not re-demonstrate its compositions; it demonstrates what the arrangement of them produces at the volumes it will actually meet.

**So a demonstration that would pass unchanged one tier down belongs one tier down.** Duplicating it costs a second place to update and buys a second report of the same fact.

## The foundation is used the way it is meant to be used

The controls layer exists to inherit keyboard behaviour, focus management and the semantics assistive technology reads. Inheriting them is not automatic: a control can wrap the foundation and still hand-roll the part it was reached for, or reach past the pattern the foundation offers for the thing being built.

So a control is read against the foundation's own guidance as well as against its own prose, and a divergence is either corrected or recorded as deliberate with the reason. Reading the guidance is part of combing a control rather than something done once at the start.

## A demonstration reads the element that carries the property

The commonest way one of these passes while proving nothing is by measuring something adjacent to the thing it names. Each of these was written, run, and corrected:

- A size ladder measured the input, and the height lives on the group around it, so three sizes gave three identical numbers.
- A vertical control measured its root, and the root keeps whatever width its container gives it, so the assertion passed for the horizontal case too.
- A count of animating parts read the outer element, which is singular whatever happens inside it.
- Reachability read "not `-1`", and an element with no such attribute answers nothing at all, which is not `-1`, so an unreachable control read as reachable.

**The commonest form of it is a reference that moves with the thing it measures.** Three in one sweep: a box measured against its own rectangle fills it at every width; a dismiss button measured against the chip beside it stays level with it however far both have slid; a size ladder measured on the element the size is not set on gives one number three times. Each passed, and each would have passed for the defect it was written to catch.

**A colour has an absolute reference, and it is cheap.** Append a throwaway element carrying the class in question, read its computed colour, remove it. That resolves the token in the same cascade the part is drawn in, so a claim like *the refusal is not drawn in the alarmed ink* becomes a comparison against the ink itself rather than against whichever sibling happens to be in the same story.

**So a reference is chosen by asking what it does when the claim is false.** A rectangle read off the parent, a control read off the card's own top, a rung read against the rung below it -- the reference has to stay put while the measured thing moves, or the comparison is between two halves of the same fact.

**So the element is chosen by asking which one the property is set on**, and a ladder is asserted as ascending rather than as a set of numbers -- a variant that stops resolving renders at the default and leaves the row looking deliberate.

**The property is chosen the same way, and the styling layer decides it rather than the shorthand does.** Three of these, all the same shape: the value is there, under a name nobody would reach for first, and the obvious reading comes back empty and compares false against everything.

- A chevron at ninety degrees reports `transform: none`. Tailwind 4 sets the standalone `rotate`, `translate` and `scale`.
- A colour at seven tenths reports `oklab(l a b / 0.7)`. An opacity modifier compiles to a `color-mix`, so an alpha assertion written for `rgba(r, g, b, a)` never sees one.
- A spacing custom property reports `calc(var(--spacing) * 3)`. `getPropertyValue` returns what was written, not what it resolves to, so a ladder asserted on it always passes.

**The tell they share is a reading that is empty, zero or `NaN` rather than wrong.** A wrong number is a finding; an absent one is usually the wrong name. So the check on any new reading is to take it once with the class present and once with it gone, and confirm the two differ -- which also settles the transition case, where a turn is animated only if `transitionProperty` names the property doing the turning.

The two together give the check: name the element the property is set on, then read the property the styling layer actually set, and confirm the reading changes when the class is taken away.

## What a demonstration must reach for

Two things sit outside the part being examined, and a query scoped to it reports both as missing.

**An overlay is not inside the thing that opened it.** A tooltip, a menu, a listbox or a dialog is placed at the document, so it is found there.

**A description is a list of ids, and not all of them are local.** The foundation names an element it appends to the document alongside the one the caller wrote, so a lookup treating the attribute as a single id, and searching only the part, finds nothing and reads as a missing description.

## Some claims this tier cannot settle, and saying so is the answer

An overlay's dismissal is one. Measured on the undismissable alert: with outside-click and keyboard dismissal both turned back on, neither a synthesised Escape nor a synthesised click on the scrim closes it here. So an assertion that the dialog survives them passes for a dismissable dialog too, and a green demonstration of the refusal would be evidence of nothing.

**The rule that follows is the one this whole change rests on.** Where breaking the behaviour leaves the demonstration green, the demonstration is removed rather than kept: it is worse than nothing, because it reads as protection. What holds such a claim is the props, a reader, and a person trying it -- and the prose says which.

## A demonstration that survives its own mutation is retargeted before it is removed

Removal is the answer where nothing in reach is falsifiable. It is the wrong answer where the demonstration was aimed at the wrong claim, which is the commoner case: the arrangement is sound and the sentence over it names a cause that is not the one doing the work.

Two shapes recur. The demonstration names a property the arrangement never exercises -- an alignment claim whose every label is short enough that nothing has to align -- and the fix is to give it the case that decides, a label longer than the row. Or the property is genuinely inert, held up by something else entirely, and then the finding is about the part rather than the demonstration: the claim moves to what a reader actually needs, and the prose says what was measured and how.

So the order is: mutate, and where the demonstration stays green, ask whether the arrangement can be made to exercise the claim before concluding the claim cannot be settled.

## A green mutation may mean the part is redundantly right, not that the demonstration is wrong

Two rules producing one result is the third reason a mutation lands green, and it is the one that looks most like the demonstration being inert. An alert aligns its title beside its icon twice over -- the icon spans both rows, and the text is pushed to the second column -- so either rule alone holds the alignment and removing either leaves the demonstration passing.

Nothing is wrong there. The demonstration is about the outcome, and the outcome survives, which is what belt and braces are for. What it does mean is that the check of whether the demonstration is connected to anything has to remove every mechanism producing the result, not the first one found. A single-rule mutation coming back green settles nothing either way.

So the three readings of a green mutation are: the arrangement never exercised the claim, the claim is held up by something else entirely, or the part is right in more than one way. The first two are findings. The third is a component doing its job, and the demonstration is kept once a full mutation reaches it.

## The foundation's answer is taken over a workaround that improves on it

`isDisabled` produces two results in this kit and both are React Aria's: a collection row takes `aria-disabled` and keeps its place in the walk, a button takes the native attribute and cannot be focused at all. So a disabled section header is invisible to somebody tabbing, and *there is no report yet* is exactly what they most need to learn.

**It is kept as it is.** React Aria offers `isPending` for a control that stays reachable while refusing, which is the shape it intends for that case; there is no supported way to make an `isDisabled` button focusable, and reaching around the foundation to build one is how a kit stops being able to take an upgrade. What follows instead is a rule about when to disable at all: **a control whose refusal carries information should not be disabled, it should say why.** A section that is not ready is a section with words in it, not a dead header.

The same reasoning settles the checkbox on a single-select collection the other way. React Aria's own Tree reference draws one, so there is no library answer -- and where the foundation has no opinion, the kit is free to have one, which is that a checkbox is a control for adding a row to a set and a single selection has no set.

## A demonstration may not perform the act for real

A form allowed to submit navigates the page, which ends the run and is reported as a lost connection rather than as a failing demonstration. The act is held back, and what is asserted is that the handler was reached.

## Where a part refuses, the refusal is reached the way an analyst reaches it

A refusal has two halves that pull against each other: reachable, so the analyst can find out why, and inert, so that finding out does not perform the action. Which half a part keeps is a real choice, and demonstrating the state that produces the refusal does not settle whether either half holds.

**Some refusals cannot be attempted, and the attempt is not the demonstration.** Where a part refuses by withdrawing itself from the pointer entirely, an attempted interaction reports nothing rather than a refusal, so the guard itself is what gets examined.

## A mutation proves nothing until the baseline is green

A demonstration is broken on purpose to establish that it is connected to something. Run against a suite that is already failing, every mutation reports as caught and none of them was.

So the harness asserts green before it mutates anything, and refuses to report at all from a red one. Without that assertion the whole method is unfalsifiable, which is worse than not using it.

## The fixture is what usually cannot fail

A demonstration that survives its own mutation is more often reaching for content that could not have shown the difference than asserting the wrong property. Two cells cannot tell a two-column grid from a three-column one; a section that hides its heading cannot show a rule under it; prose wraps whether or not the column was told it may, so only a token that cannot break tests the telling.

Retarget the content before the assertion.

## The standard is read before the tier is started

The specification already says which states a part owes. A standard invented per part diverges from it, and the parts done earliest are the ones documented to the least of it.

So the states are taken from the specification first, and a tier is worked to one standard throughout -- including going back to whatever was finished before the standard was settled.

## A part built out of several, drawn by one screen, is that screen's body

The tiers are enforced by which way an import may point, and that says nothing about whether a part belongs to the tier it sits in. A composition assembling several others and rendered by exactly one screen has no second caller to answer to, and its story stands in for that screen's.

Genuine reuse is the test rather than the count: a frame eleven screens mount is a composition however much it assembles.

## Volume is a property of the screen, not of its content

A screen is exercised at the volumes that break it rather than at one comfortable filling, and the content comes from outside it.

Content held inside a screen has two failures rather than one: the screen is exercisable at a single volume, and the content eventually reaches an analyst as though it were their case.

## Both tiers are exercised at volume, and they are asking different questions

A block under load answers whether its own design survives: whether a form overflows, a row crowds, a column that fits three fields fits eight. A screen under load answers whether what it holds is still readable as a whole.

Neither answer stands in for the other. A block that holds its shape can still sit on a screen nothing can be found on, and a screen that reads well can be composed of blocks that each break a little.

So a part that presents data owes a volume demonstration at its own tier, filled through its arguments the way its caller fills it -- and the screen above it owes one of its own.
