/** The end of the selection that moves as you drag or shift-arrow. */
export type Side = 'top' | 'bottom'

/**
 * Which side of the selection the formatting menu goes on: `bottom` when the
 * selection runs backwards, `top` otherwise.
 *
 * A named function because no test here can see the effect: whether
 * `placement` is the prop Tiptap forwards, and whether floating-ui's `flip`
 * overrides it near an edge, were both checked by hand.
 */
export function bubbleSide(head: number, anchor: number): Side {
  return head < anchor ? 'bottom' : 'top'
}
