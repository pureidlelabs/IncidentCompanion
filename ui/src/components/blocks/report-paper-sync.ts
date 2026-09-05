/**
 * Keeping the printed page level with the section being written.
 */

/** What a scroller has to answer for. */
export interface Pane {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/** One section, as one of the two columns lays it out. */
export interface Band {
  /** The block's id. Both columns name their elements from the same one. */
  id: string
  /** The section's top within its own scroller's content. */
  top: number
  /** How tall the section is in that column. */
  height: number
}

/**
 * Where the paper should sit so its section is level with the editor's.
 *
 * Returns `null` when there is nothing to do -- no bands, or no section in
 * common -- rather than `0`, which would yank the page to the top on a short
 * report.
 */
export function paperScrollTop(
  pane: Pane,
  editor: readonly Band[],
  paper: readonly Band[],
): number | null {
  // No test for a paper column with no sections: the lookup below answers
  // `undefined` for one and returns `null` anyway. Measured by mutation.
  if (editor.length === 0) return null

  // The last section that has started above the viewport top. `<=` rather than
  // `<`: at rest the first section's top is exactly the scroll position, and a
  // strict test picks nothing there.
  let current: Band | undefined
  for (const band of editor) {
    if (band.top <= pane.scrollTop) current = band
    else break
  }
  current ??= editor[0]
  if (current === undefined) return null

  const mate = paper.find((band) => band.id === current.id)
  if (mate === undefined) return null

  // Clamped, because the caret can sit in a section whose editor height is
  // shorter than the distance scrolled past it - an unclamped fraction then
  // pushes the page past the next section and reads as a jump.
  const progress =
    current.height > 0
      ? Math.min(1, Math.max(0, (pane.scrollTop - current.top) / current.height))
      : 0
  return mate.top + progress * mate.height
}

/**
 * Read a column's sections out of the DOM, in the order asked for.
 */
export function bandsOf(
  scroller: HTMLElement,
  ids: readonly string[],
  elementId: (id: string) => string,
): Band[] {
  const bands: Band[] = []
  for (const id of ids) {
    // `CSS.escape`, because a block id is data: a `.` or a `:` in one would be
    // read as a class or a pseudo-class and the lookup would throw.
    const found = scroller.querySelector<HTMLElement>(`#${CSS.escape(elementId(id))}`)
    if (found === null) continue
    bands.push({ id, top: found.offsetTop, height: found.offsetHeight })
  }
  return bands
}

/**
 * The box this element scrolls inside.
 */
export function scrollerOf(from: HTMLElement): HTMLElement | null {
  let parent = from.parentElement
  while (parent !== null) {
    const overflow = getComputedStyle(parent).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return parent
    parent = parent.parentElement
  }
  return null
}
