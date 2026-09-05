import { useState } from 'react'

/**
 * The gallery's stand-in for a server-minted id.
 */
let minted = 0
export function localId(prefix: string): string {
  minted += 1
  return `${prefix}-new-${String(minted)}`
}

/**
 * Which dialog a table's create and edit doors have open, if either.
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
