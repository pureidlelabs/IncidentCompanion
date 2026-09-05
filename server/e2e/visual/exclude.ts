/**
 * What the probes must not measure as page furniture on a React screen.
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
