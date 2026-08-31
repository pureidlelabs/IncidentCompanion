import { useState } from 'react'

/**
 * The gallery's stand-in for a server-minted id.
 *
 * A row added in a story exists only in that screen's own copy of the case, so
 * it needs an id nothing else in the fixture holds. Monotonic rather than
 * random: a story that adds two rows and asserts on both needs the second id
 * to differ from the first, and nothing here is persisted for a stable id to
 * matter to.
 */
let minted = 0
export function localId(prefix: string): string {
  minted += 1
  return `${prefix}-new-${String(minted)}`
}

/**
 * Which dialog a table's create and edit doors have open, if either.
 *
 * The two are one piece of state because they are one dialog: opening the
 * pencil while the add form is up would otherwise mount two, and the second
 * would render behind the first's scrim.
 */
export interface RowEditor<TRow> {
  /** True while the create dialog is open. */
  creating: boolean
  /** The row the pencil opened, or `null`. */
  editing: TRow | null
  add: () => void
  edit: (row: TRow) => void
  close: () => void
}

export function useRowEditor<TRow>(): RowEditor<TRow> {
  const [open, setOpen] = useState<{ row: TRow | null } | null>(null)
  return {
    creating: open !== null && open.row === null,
    editing: open?.row ?? null,
    add: () => {
      setOpen({ row: null })
    },
    edit: (row) => {
      setOpen({ row })
    },
    close: () => {
      setOpen(null)
    },
  }
}
