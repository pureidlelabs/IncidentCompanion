/**
 * The fields an analyst is changing on one record, each held against the
 * version it was read at.
 *
 * A field with no hold shows what the server holds. A field the analyst
 * changes is held until the server holds their value, and every record served
 * in the meantime is judged against it by `reconcile`.
 * -> `openspec/specs/state/design.md`
 */
import { useEffect, useState } from 'react'

import { ApiError } from './client'
import { same } from './entryFields'
import { drawn, type Read } from './rowWrite'

/** One field the analyst is changing. */
export interface Hold {
  /** What the server held for the field when the change began. */
  base: unknown
  /** The version `base` was read at, which is the version a write of the field states. */
  read: Read
  /** What the analyst has put there. */
  mine: unknown
  /** A write of the field is out. */
  sending?: boolean | undefined
  /** The last write was refused against its version; the next newer record decides why. */
  refused?: boolean | undefined
  /** A write is owed as soon as none is out. */
  again?: boolean | undefined
  /** Another analyst's value, and the version it arrived at. */
  theirs?: { value: unknown; version: Read } | undefined
  /** Why the last write failed, when it was not refused against its version. */
  failed?: string | undefined
}

export type Holds = Readonly<Record<string, Hold>>

type Row = { version: number } & object

const fieldOf = (row: Row, field: string): unknown => (row as Record<string, unknown>)[field]

/** One held field against a record served again. */
function judge(hold: Hold, value: unknown, version: number): Hold | undefined {
  if (version <= hold.read || hold.sending) return hold
  if (same(value, hold.mine)) return undefined
  if (same(hold.mine, hold.base)) return undefined
  const at = drawn({ version }).version
  if (same(value, hold.base)) {
    return {
      base: hold.base,
      read: at,
      mine: hold.mine,
      ...(hold.refused === true || hold.again === true ? { again: true } : {}),
    }
  }
  return { base: hold.base, read: hold.read, mine: hold.mine, theirs: { value, version: at } }
}

/**
 * Every held field judged against a record served again.
 *
 * @returns `holds` itself when nothing moved, so a caller can tell.
 */
export function reconcile(holds: Holds, served: Row): Holds {
  let moved = false
  const next: Record<string, Hold> = {}
  for (const [field, hold] of Object.entries(holds)) {
    const judged = judge(hold, fieldOf(served, field), served.version)
    if (judged !== hold) moved = true
    if (judged) next[field] = judged
  }
  return moved ? next : holds
}

/** What a failed write is shown as under its field. */
function failure(error: unknown): string {
  return error instanceof ApiError && error.message
    ? error.message
    : 'IncidentCompanion did not answer.'
}

const WAITING = 'Not saved yet: another analyst changed this record. Checking what they changed.'

export interface RowDraft {
  /** The record as the analyst sees it: what the server holds, with each held field over it. */
  view: Readonly<Record<string, unknown>>
  holds: Holds
  /** The analyst changed a field. Nothing is written. */
  set: (field: string, value: unknown) => void
  /** The analyst left a field. A per-field draft writes it, if it changed and nobody else did. */
  leave: (field: string) => void
  /** A choice made in one act: set, and written at once. */
  commit: (field: string, value: unknown) => void
  /** Write these values in one request, held against what the analyst read. */
  send: (values: Readonly<Record<string, unknown>>, read?: Read) => Promise<void>
  /** Keep the analyst's value over the one another analyst stored. */
  keepMine: (field: string) => void
  /** Take the value another analyst stored, and drop the analyst's own. */
  takeTheirs: (field: string) => void
  /** Why each field's last write did not stand, by field. */
  problems: Readonly<Record<string, string>>
  /** The field differs from what the server held when the analyst began changing it. */
  changed: (field: string) => boolean
}

/**
 * The fields an analyst is changing on `served`.
 *
 * @param save - writes values against a read version, answering the record
 *   as stored. Absent, nothing is written: a gallery drawing.
 * @param each - `true` writes a field when it is left, and a kept value at
 *   once; `false` writes only what the caller hands `send`, as a dialog does.
 */
export function useRowDraft(
  served: Row | undefined,
  save: ((values: Record<string, unknown>, read: Read) => Promise<unknown>) | undefined,
  each: boolean,
): RowDraft {
  const [holds, setHolds] = useState<Holds>({})
  const [given, setGiven] = useState(served)
  if (given !== served) {
    setGiven(served)
    if (served) setHolds((current) => reconcile(current, served))
  } else if (
    served &&
    Object.values(holds).some((hold) => hold.refused && !hold.sending && served.version > hold.read)
  ) {
    // Refused after the newer record arrived: no new one may follow, so judge against it.
    setHolds((current) => reconcile(current, served))
  }

  const update = (
    fields: readonly string[],
    change: (hold: Hold, field: string) => Hold | undefined,
  ) => {
    setHolds((current) =>
      Object.fromEntries(
        Object.entries(current).flatMap(([field, hold]) => {
          if (!fields.includes(field)) return [[field, hold]]
          const changed = change(hold, field)
          return changed ? [[field, changed]] : []
        }),
      ),
    )
  }

  const begun = (field: string, value: unknown): Hold | undefined =>
    served ? { base: fieldOf(served, field), read: drawn(served).version, mine: value } : undefined

  const set = (field: string, value: unknown) => {
    setHolds((current) => {
      const hold = current[field] ?? begun(field, value)
      return hold ? { ...current, [field]: { ...hold, mine: value, failed: undefined } } : current
    })
  }

  /** The oldest version any of these fields was read at; the chain carries it past this tab's own writes. */
  const readOf = (fields: readonly string[]): Read | undefined => {
    let low: Read | undefined
    for (const field of fields) {
      const one = holds[field]?.read ?? (served ? drawn(served).version : undefined)
      if (one !== undefined && (low === undefined || one < low)) low = one
    }
    return low
  }

  const send = async (values: Readonly<Record<string, unknown>>, stated?: Read): Promise<void> => {
    const fields = Object.keys(values)
    const read = stated ?? readOf(fields)
    if (!save || fields.length === 0 || read === undefined) return
    setHolds((current) => {
      const next: Record<string, Hold> = { ...current }
      for (const field of fields) {
        const hold = next[field] ?? begun(field, values[field])
        if (hold)
          next[field] = {
            ...hold,
            mine: values[field],
            sending: true,
            again: false,
            refused: false,
            failed: undefined,
          }
      }
      return next
    })
    try {
      const answer = (await save({ ...values }, read)) as Partial<Row> | undefined
      update(fields, (hold, field) => {
        const stored = answer && field in answer ? fieldOf(answer as Row, field) : values[field]
        const at =
          typeof answer?.version === 'number'
            ? drawn({ version: answer.version }).version
            : undefined
        if (at === undefined)
          return same(hold.mine, values[field]) ? undefined : { ...hold, sending: false }
        return same(hold.mine, values[field])
          ? { base: stored, read: at, mine: stored }
          : { base: stored, read: at, mine: hold.mine, ...(hold.again ? { again: true } : {}) }
      })
    } catch (error) {
      const refused = error instanceof ApiError && error.writeConflict
      update(fields, (hold) => ({
        ...hold,
        sending: false,
        ...(refused ? { refused: true } : { failed: failure(error) }),
      }))
      throw error
    }
  }

  const quietly = (values: Readonly<Record<string, unknown>>, read?: Read) => {
    send(values, read).catch(() => undefined)
  }

  const leave = (field: string) => {
    const hold = holds[field]
    // A refused field waits for the record to be read again, which decides it.
    if (!each || !hold || hold.theirs || hold.refused) return
    if (hold.sending) {
      update([field], (one) => ({ ...one, again: true }))
      return
    }
    if (same(hold.mine, hold.base)) {
      update([field], () => undefined)
      return
    }
    quietly({ [field]: hold.mine })
  }

  const commit = (field: string, value: unknown) => {
    set(field, value)
    if (!each) return
    const hold = holds[field]
    if (hold?.sending) {
      update([field], (one) => ({ ...one, mine: value, again: true }))
      return
    }
    if (hold?.theirs) return
    quietly({ [field]: value })
  }

  const keepMine = (field: string) => {
    const hold = holds[field]
    if (!hold?.theirs) return
    const kept: Hold = { base: hold.theirs.value, read: hold.theirs.version, mine: hold.mine }
    setHolds((current) => ({ ...current, [field]: kept }))
    if (each) quietly({ [field]: hold.mine }, kept.read)
  }

  const takeTheirs = (field: string) => {
    update([field], () => undefined)
  }

  // A write owed once the one out is answered, or once a refusal turned out to
  // be over a field nobody else moved. A dialog sends only when nothing of it
  // is in dispute, because its save is one act.
  useEffect(() => {
    if (!save) return
    const owed = Object.entries(holds).filter(
      ([, hold]) => hold.again === true && hold.sending !== true && hold.theirs === undefined,
    )
    if (owed.length === 0) return
    if (
      !each &&
      Object.values(holds).some((hold) => hold.theirs !== undefined || hold.sending === true)
    )
      return
    const values = Object.fromEntries(owed.map(([field, hold]) => [field, hold.mine]))
    send(values).catch(() => undefined)
    // `send` closes over this render's holds, which is what it must read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holds])

  const view: Record<string, unknown> = { ...(served as Record<string, unknown> | undefined) }
  const problems: Record<string, string> = {}
  for (const [field, hold] of Object.entries(holds)) {
    view[field] = hold.mine
    if (hold.failed) problems[field] = hold.failed
    else if (hold.refused) problems[field] = WAITING
  }

  return {
    view,
    holds,
    set,
    leave,
    commit,
    send,
    keepMine,
    takeTheirs,
    problems,
    changed: (field) => {
      const hold = holds[field]
      return hold !== undefined && !same(hold.mine, hold.base)
    },
  }
}
