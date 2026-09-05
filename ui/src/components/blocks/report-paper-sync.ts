/**
 * Keeping the printed page level with the section being written.
 *
 * One way, editor to paper: writing `scrollTop` in both directions makes each
 * pane's write fire the other's handler, and the two chase each other. Nothing
 * here writes to the editor's scroller, so
 * scrolling the page on its own is overridden at the next editor scroll,
 * which is what a preview does.
 *
 * Anchored on the section, not on a ratio of the whole: the two columns have
 * unrelated heights per section (a written body runs long in the editor and
 * short on the page, a generated table the reverse), so a proportional
 * `scrollTop` would drift further out the longer the report is. Aligning the
 * section and carrying the fraction scrolled within it keeps the two level
 * at every point.
 *
 * The decision lives here rather than in the component because jsdom gives
 * every element a zero box, and the measuring is exactly the part no test
 * below the browser can see.
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
 *
 * `offsetTop` against the scroller's own content box, so the numbers are in the
 * same space as `scrollTop`. A `getBoundingClientRect` here would be
 * viewport-relative and would change as you scrolled, which is the one thing
 * this must not do.
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
 * The box this element scrolls inside. The pane scrolls and the columns do
 * not, so the sync has to find the pane rather than assume a parent is it.
 * `null` where nothing above it scrolls, rather than the document -- writing
 * `scrollTop` there would move the window rather than the page.
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
