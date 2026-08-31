# Document the interface in its stories

## Why

`openspec/specs/interface` already requires that every part be exercisable in isolation in each state it can actually be in. The gallery satisfies the letter of that and not its purpose: 220 story files hold 1,258 stories, and almost none assert that a story shows what its prose claims. 16 of 87 kit story files carried a play function of any kind.

Three consequences follow, and each has been demonstrated rather than supposed.

**A story can document behaviour the component does not have.** `mark.tsx` stated that it takes its colour from whatever it is placed in; measured, all three grounds paint `oklch(0.22 0.012 260)`. Its story demonstrated the claim on three coloured surfaces, and three identically painted marks look the same whether the claim holds or not.

**A caller obligation nothing states is a caller obligation nobody meets.** The kit's `Form` defaults `validationBehavior` to `"aria"`, so `validate` marks a field and the submission still runs. A caller reading `validate` as a guard writes no other one.

**A control panel can be decorative.** 357 stories declare arguments against a render that ignores them, so the panel offers settings that change nothing on screen.

The interface is also the input to the work that follows it: screens are added against the gallery, so a story documenting nothing becomes a screen built on a guess.

## What Changes

- Every part's stories state what the caller owns -- what it must supply, what it may not assume, and what the part refuses to do for it.
- A composition's stories demonstrate the dependencies between its parts, not only that each part draws.
- Every part that presents data is exercised at the extremes of content volume, at its own tier and at the tier above it.
- Documentation lives in the JSDoc the page is generated from. A sibling `.mdx` is a second description that no instrument reaches.
- A tier is worked to one standard, and the standard is settled before the tier is started rather than discovered part way through it.
- A part whose place in the tiers is wrong is named as such rather than documented where it sits.

## Impact

- `openspec/specs/interface/spec.md` -- three requirements added.
- `ui/src/**/*.stories.tsx` -- every story file, worked through by tier.
- No behaviour changes. Where a defect is found the fix is its own change.
