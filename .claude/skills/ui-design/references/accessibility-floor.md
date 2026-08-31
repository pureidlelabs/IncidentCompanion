# The accessibility floor

*Load when adding a control, a dialog, a field, or anything icon-only. This is a floor, not an aspiration: a learned constraint may override a design default, never one of these.*

**Neither suite can see any of it.** The Python tier has no DOM, and jsdom gives every element a zero box — so a missing focus ring, a trapped tab order and an unlabelled button all pass. What catches them is this list and the `visual-check` skill.

## Names

- **Every interactive control has an accessible name.** Icon-only buttons take `aria-label`; decorative icons take `aria-hidden="true"`. Measured 2026-08-03: 65 files in `ui/src` carry an `aria-label`, and the row's `⋯`, chevron, pencil and bin are all icon-only — that family is the one that regresses.
- **Every input has a real `<label>`.** A placeholder is not a label: it leaves at the first keystroke, exactly when the analyst transcribing off an alert needs to check which field they are in.

## Keyboard

- **Never a `div` as a button.** Use `<button>`; the keyboard, the focus ring and the role come with it.
- **Never `tabindex` above 0.**
- **Escape closes.** Dialogs are shadcn's and get this free — which is most of why hand-rolling one is refused.
- **Hover is never the only way in.** The row's controls reveal on hover *and* focus, and `row-actions.tsx` owns that pair — a screen re-implementing the reveal loses the focus half and nothing goes red.
- **The chord registry is the keyboard vocabulary**, and a command offered in the toolbar is offered in the palette and the cheat sheet because `SectionActionRow` draws all three from one definition.

## Focus

- **Never `outline: none` without a visible replacement.**
- **The kit has one focus ring, and a screen does not invent a second.** `border-ring ring-3 ring-ring/50` is the treatment, carried by button, checkbox, radio, switch, toggle, drop-zone and the field wrappers. A control that needs a different one gets it changed *in the kit*. for the two-shadow technique that was the alternative, and why offering both was the mistake
- **A programmatic `.focus()` does not match `:focus-visible`.** Focusing an element in code draws no ring, so "we focus the first invalid field" and "the analyst can see which field" are two separate claims and only one of them is usually true.
- **A dialog traps focus while open and restores it to the trigger on close.**

## Forms

- **Errors sit at the field**, linked with `aria-describedby`, with `aria-invalid="true"` on the input. Red is a signal, not the message.
- **On submit, focus the first invalid field** — and see the `:focus-visible` trap above before claiming the analyst can see it.
- **Never block paste.** Every hash, hostname and technique id on these screens arrives by paste.
- **Enter submits a single-line field.** `datetime-input.tsx` exists because an analyst copies a stamp off an alert rather than picking a day.
- **Warn before discarding unsaved changes.** A dialog closed by a stray Escape loses a transcription.

## Colour and state

- **Hue is never the sole carrier.** The rail's colour is named in words beside it, so a row survives a greyscale print and a red/green deficiency.
- **A disabled control says why**, and is not distinguished by colour alone.
- **An interaction raises contrast.** Hover and active are more contrast than rest, never less.
- **A colour in the DOM and the same colour in an SVG export are two decisions.** An export has no theme to consult; collapsing them reintroduced a 2.59:1 chip once already.

## Motion

`prefers-reduced-motion` is honoured in exactly one place — `ambient-field.tsx`, which stops issuing frames rather than animating invisibly. Anything new that moves owes the same. → `motion.md`

## Where this app inverts the usual advice

- **Touch targets are not 44px here.** The floor is **24px**, set by the control the row's actions sit on, and the 32px table row is built to it. This is a desktop tool used with a mouse and a keyboard for a shift at a time; the 44px guidance is a phone guideline and applying it would undo the density the maintainer asked for. Do not "fix" the row height to 44px.
- **And the 24px floor is for a *major* control, not for every mark.** The maintainer's ruling, 2026-08-25: a button, a menu item, a row action, a link that is the only way onward — those are held to it. A dismissal cross inside a tag or a filter token, and an inline link, are not; **browser zoom is the answer for those**, and this is a desktop tool driven with a mouse.

  What follows, so the probe's output is read correctly: `small-target` on a secondary mark is **accepted, not open**. Three decisions already stand — the tag's cross at 16px, the filter token's at 20px, and the number field's steppers — and each shrank its *glyph* while keeping its box, because the box is the target and only the mark is drawn. Do not close one of these by growing the control it sits in; that was considered and refused, since a 24px cross inside a 20px tag makes every tag in the app taller.

  **Two more were accepted on the same reading, 2026-08-25**, and both miss on height alone while carrying a wide box: the entity hover card's door at 117×16, and the pick pane's clear at 104×21. A wide, short target is the shape this ruling is about — the pointer finds it on the axis it is travelling, and the analyst who cannot is the one browser zoom serves. The probe reports these every run; they are answered here rather than in the probe, because the next thing to reopen them is a tablet rather than a measurement.

  **The day this reopens is the day someone uses this on a tablet**, or with a tremor. It is a product judgement about who is at the keyboard rather than a reading of WCAG 2.5.8, which the app otherwise meets.
- **Contrast is the maintainer's call, not a gate.** Ruled 2026-08-26: the WCAG ratios are holding the interface back, and a compliant *design language* is the answer rather than compromising the default one. So a measured ratio is reported and never treated as a defect on its own -- `--severity-critical` carries its foreground at 3.76:1 on dark and stays.

  **The mechanism already exists and is the reason this is affordable.** `tokens.css` is three independent axes -- language, theme, role -- and a second language is one `[data-language]` block per theme with no component change, because no component names a colour. So an accessible language is an appended block, not a rework, and it can be built the day somebody needs it rather than paid for on every screen now.

  **What that does not license.** A ratio nobody measured is still unknown, and the compliant language cannot be written from an interface nobody has numbers for -- so `visual-check` keeps reporting them. And this covers *contrast* only: a name, a focus ring, a keyboard route and a target that can be hit are not aesthetic trades and are not covered by it.

- **There is no skip-to-content link**, because there is no repeated masthead to skip — the rail is the navigation and it is reachable in one tab.

## What to actually run

The suite cannot see any of this. **Run the `visual-check` skill** for anything touching the shell, navigation, tables, dialogs, the picker, the auth screens or the graphs — and do not write a Playwright script.
