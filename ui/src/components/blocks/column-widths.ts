/**
 * Column widths for a `table-fixed` grid, sized from what the columns hold.
 *
 * A column carrying a fixed width class keeps it. Every other column is at
 * least as wide as its head, and the room left over is shared in proportion
 * to how much more than that its values want -- so a long value is cut before
 * a short one is padded, and a head is never cut at all.
 *
 * Resolved to pixels once the table has been measured: a fixed table layout
 * takes a plain length or a percentage for a column and ignores a `calc()`
 * mixing the two. Before the measure, the shares are percentages of the whole.
 */

export interface WidthInput {
  id: string
  /** The column head's words. */
  header: string
  /** The column's `meta.className`, read for a fixed width and a mono face. */
  className?: string | undefined
  /** What the column shows, one string per row. */
  values: readonly string[]
}

/**
 * The room the table is given: its width, the root font size, and one
 * character's width in a cell.
 *
 * The width is the scroller's, never the table's. A table under `table-fixed`
 * is held open by the pixel columns this resolves, so measuring it would make
 * the input its own output and the widths could never narrow. -> #523
 */
export interface MeasuredBox {
  width: number
  rem: number
  ch: number
}

export const MAX_CH = 40
/** Sized to most values, not the longest: one outlier does not take the row. */
const PERCENTILE = 0.9
/** Mono glyphs are wider than the sans average at the same count. */
const MONO_FACTOR = 1.2
/**
 * A head's padding, its sort glyph and the gap between them, in characters.
 *
 * Characters rather than pixels because the chrome and the character are the
 * same unit underneath: the spacing scale and the type scale are both rem, so
 * the ratio between them holds at every root size. It is 5.6, and the rest is
 * the slack a short head has no other source for -- a long one carries plenty
 * from `HEAD_FACTOR`, a three-letter one carries none.
 *
 * What this does not cover is a head of wide capitals. `MMM` wants more than
 * the count allows; no head in the tree is one, and `NoHeadIsCut` is what
 * would say so if one arrived.
 */
const HEAD_CHROME_CH = 6.5
/** A head is uppercase and tracked, so each of its characters is wider than a body one. */
const HEAD_FACTOR = 1.25
/** A cell's padding, in characters. */
const CELL_CHROME_CH = 4

/** The width a `w-N` or `w-[Nrem]` class fixes, in rem. Percentages are not fixed. */
export function fixedRem(className: string | undefined): number | undefined {
  if (!className) return undefined
  const rem = /\bw-\[(\d+(?:\.\d+)?)rem\]/.exec(className)
  if (rem?.[1] !== undefined) return Number(rem[1])
  const step = /\bw-(\d+)\b/.exec(className)
  if (step?.[1] !== undefined) return Number(step[1]) / 4
  return undefined
}

/** What a column needs, in characters: the floor its head sets, and what its values want. */
export function needCh(input: WidthInput): { min: number; want: number } {
  const lengths = input.values.map((value) => value.length).sort((a, b) => a - b)
  const at = lengths.length === 0 ? 0 : (lengths[Math.floor(PERCENTILE * (lengths.length - 1))] ?? 0)
  const mono = input.className !== undefined && /\b(font-mono|text-data)\b/.test(input.className)
  // **Counted, never measured.** A head read back off the drawn table is this
  // function's own output arriving as its input. -> #530
  const min = input.header.length * HEAD_FACTOR + HEAD_CHROME_CH
  const want = Math.min(MAX_CH, Math.max(min, at * (mono ? MONO_FACTOR : 1) + CELL_CHROME_CH))
  return { min, want }
}

/** A CSS width per column id. */
export function columnWidths(
  inputs: readonly WidthInput[],
  box?: MeasuredBox,
): Record<string, string> {
  const out: Record<string, string> = {}
  let fixed = 0
  const flexible: { id: string; min: number; want: number }[] = []
  for (const input of inputs) {
    const rem = fixedRem(input.className)
    if (rem !== undefined) {
      out[input.id] = `${String(rem)}rem`
      fixed += rem
    } else {
      flexible.push({ id: input.id, ...needCh(input) })
    }
  }
  if (flexible.length === 0) return out

  if (!box) {
    const total = flexible.reduce((sum, one) => sum + one.want, 0)
    for (const one of flexible) {
      out[one.id] = `${String(Math.round((one.want / total) * 100_000) / 1000)}%`
    }
    return out
  }

  const room = (box.width - fixed * box.rem) / box.ch
  const mins = flexible.reduce((sum, one) => sum + one.min, 0)
  const wants = flexible.reduce((sum, one) => sum + one.want, 0)
  for (const one of flexible) {
    let ch: number
    if (room >= wants) {
      // Everyone has what they want; the rest is shared by want, so a wide
      // column and a narrow one grow in step.
      ch = one.want + (room - wants) * (one.want / wants)
    } else {
      // Short of room: the heads hold, and what sits above them gives way
      // evenly. Below the floors the table is wider than its box and scrolls.
      const k = wants === mins ? 0 : Math.max(0, (room - mins) / (wants - mins))
      ch = one.min + (one.want - one.min) * k
    }
    out[one.id] = `${String(Math.floor(ch * box.ch))}px`
  }
  return out
}
