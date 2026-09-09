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
 * **A dead exclusion over-reports rather than under-reports**: it produces
 * extra findings, never missing ones, so a list that has rotted certifies
 * nothing clean.
 *
 * ## Why `data-part` and not a vendor attribute
 *
 * **React Aria stamps no portal marker.** `rg --only-matching
 * 'data-react-aria-[a-z-]+' node_modules/react-aria-components/dist` returns
 * exactly one, `data-react-aria-prevent-focus`, which is not a container, and
 * there is no `data-rac`. The kit's own handle is `data-part`, which 60 kit
 * files write, `popover.tsx` and `tooltip.tsx` among them.
 *
 * `popover` is the base for `Menu`, `Select`, `ComboBox` and `HoverCard`, so
 * the one selector covers every anchored surface in the app.
 */
export const REACT_EXCLUDE = [
  // The page behind a modal, which React Aria marks itself. Not the overlay.
  '[aria-hidden="true"]',
  '[data-part="popover"]',
  '[data-part="popover"] *',
  '[data-part="tooltip"]',
  '[data-part="tooltip"] *',
  '[data-part="dialog"]',
  '[data-part="dialog"] *',
  '[data-part="alert-dialog"]',
  '[data-part="alert-dialog"] *',
  '[data-part="sheet"]',
  '[data-part="sheet"] *',
  '[data-part="toast-region"]',
  '[data-part="toast-region"] *',
].join(', ')
