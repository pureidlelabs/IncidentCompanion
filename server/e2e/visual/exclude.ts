/**
 * What the probes must not measure as page furniture on a React screen.
 *
 * An overlay is portalled to `<body>`, so it is a sibling of the app rather
 * than a descendant of what it covers - and it covers what is under it by
 * design. Without an exclusion every row beneath an open overlay is an
 * `overlap` candidate, and one exclusion buys three checks at once: `overlap`,
 * `offscreen` and `small-target` all read the same tree.
 *
 * **A new overlay kind needs adding here with its children**, or the rows
 * under it become candidates.
 *
 * ## The list was four-sixths dead, and this is what it cost
 *
 * It excluded `[data-radix-popper-content-wrapper]` when **Radix is not a
 * dependency of `ui/`** (`rg '"@radix' ui/package.json` finds nothing), and a
 * `select[aria-label="Theme"]` that no longer exists - `GroundSwitcher` became
 * a rail fold-out, and its own docstring says it *was* a fixed bottom-right
 * card. Four selectors matching nothing.
 *
 * Meanwhile **neither overlay vendor this tree actually uses had an entry at
 * all**, and 62 stories across 16 files now render their overlays open. Every
 * one was being measured as furniture. The direction of that error is
 * over-reporting rather than under-reporting - a dead exclusion produces extra
 * findings, never missing ones - so nothing was certified clean by it; but any
 * `overlap` on a story with an open overlay was the list's fault rather than
 * the component's.
 *
 * ## Why `data-slot` and not a vendor attribute
 *
 * **React Aria stamps no portal marker.** `rg --only-matching
 * 'data-react-aria-[a-z-]+' node_modules/react-aria-components/dist` returns
 * exactly one, `data-react-aria-prevent-focus`, which is not a container, and
 * there is no `data-rac`. The kit's own handle is `data-slot`, which 60 kit
 * files write - and `popover.tsx` and `tooltip.tsx` were the two that did not,
 * which is why this could not be written until they did.
 *
 * `popover` is the base for `Menu`, `Select`, `ComboBox` and `HoverCard`, so
 * the one selector covers every anchored surface in the app.
 */
export const REACT_EXCLUDE = [
  // The page behind a modal, which React Aria marks itself. Not the overlay.
  '[aria-hidden="true"]',
  // Every anchored surface: popover, menu, select, combo box, hover card.
  '[data-slot="popover"]',
  '[data-slot="popover"] *',
  '[data-slot="tooltip"]',
  '[data-slot="tooltip"] *',
  // Modal surfaces, which portal the same way.
  '[data-slot="dialog"]',
  '[data-slot="dialog"] *',
  '[data-slot="alert-dialog"]',
  '[data-slot="alert-dialog"] *',
  '[data-slot="sheet"]',
  '[data-slot="sheet"] *',
  // The kit's own toast region, which stacks over whatever is beneath it.
  '[data-slot="toast-region"]',
  '[data-slot="toast-region"] *',
].join(', ')
