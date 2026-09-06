import { createContext, useContext, type ReactNode } from 'react'

import { editedLabel, stampFor, type Attribution } from '@/api/attribution'
import type { CollectionName } from '@/api/model'
import { cn } from '@/lib/cn'

/**
 * Who last wrote each row, for every expanded panel at once.
 *
 * Mount it once, at the shell. Absent, the attribution line is not drawn and
 * nothing else changes.
 */
const AttributionContext = createContext<Attribution | undefined>(undefined)

export function AttributionProvider(
  { value, children }: { value: Attribution | undefined; children: ReactNode },
) {
  return (
    <AttributionContext.Provider value={value}>{children}</AttributionContext.Provider>
  )
}

/**
 * What an expanded row holds that its columns do not show.
 *
 * Composition: `DetailGrid > Fact*`. Each fact is its own block and wraps, so
 * the pane's width decides how many share a line - a panel of two and a panel
 * of nine both read correctly.
 *
 * - Labels take `--text-micro`, values `--text-data`.
 * - Pass both `table` and `entryId` for the attribution line, or neither.
 */
export function DetailGrid({ children, table, entryId }: {
  children: ReactNode
  /** The collection this row is in, in the server's own spelling (`network_indicators`, not `network`). */
  table?: CollectionName
  entryId?: string
}) {
  const attribution = useContext(AttributionContext)
  const stamp = table && entryId ? stampFor(attribution, table, entryId) : undefined
  return (
    <dl
      data-slot="detail-grid"
      className={cn(
        // **The surface is the block's, not the caller's.** A `className` here
        // is how one screen adds its own margin, padding and ground, leaving a
        // panel that is nominally the shared component and measurably a
        // different design. Where it sits is the caller's; how it looks is not.
        'grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-x-6 gap-y-3',
        'rounded-sm bg-muted/40 px-3 py-2.5',
      )}
    >
      {children}
      {/* **Last, and only when the row has ever been written.** It is the one
          fact here that is not about the incident - it is about the copy on
          screen - so it reads after the ones that are. A row nobody has
          touched is absent from the feed rather than "edited by nobody". */}
      {stamp && <Fact label="Edited">{editedLabel(stamp)}</Fact>}
    </dl>
  )
}

/**
 * One labelled fact.
 *
 * **Sans, unless the value is an identifier.** `--text-data` is a *size*, and
 * its own rule names the face separately: "mono text an analyst would copy,
 * compare or grep". A hash is that; "Demo Analyst", "in progress" and
 * "internal - server" are not, and a code face has even colour and no word
 * shape - scanning prose set in one becomes reading it.
 *
 * The entities panel set `font-mono` on all eight of its values and was the
 * only panel in the app that did, which is what made three screens look like
 * three designs when the sizes had already converged. Exactly one fact passes
 * `mono` today: the SHA-256.
 */
export function Fact({
  label,
  mono,
  children,
}: {
  label: string
  mono?: boolean | undefined
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="font-mono text-micro uppercase tracking-micro text-ink-muted">
        {label}
      </dt>
      <dd className={cn('min-w-0 break-words text-data', mono && 'font-mono')}>{children}</dd>
    </div>
  )
}

/**
 * The bookkeeping every row carries and no analyst asked about.
 *
 * `version` is the optimistic-concurrency counter, `createdAt`/`updatedAt` and
 * their `-By` pair are the change feed's, and `id`/`caseId` are addresses. The
 * one of them that is worth reading is *who last wrote this row*, and
 * `DetailGrid` already draws it as `Edited` from the attribution feed - in
 * words, in the reader's locale, rather than as a raw stamp.
 */
const BOOKKEEPING = new Set([
  'id',
  'caseId',
  'version',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
])

/** `taskType` reads as "task type", which is what the field is called on the form. */
function spaced(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').toLowerCase()
}

/**
 * An expanded row drawn from whatever the entry stores.
 *
 * Every key with a value, less the bookkeeping and less whatever the table
 * already gives a column - a panel repeating the row above it is a control
 * that leads nowhere, one step later. Pass `table` and `entryId` for the
 * attribution line.
 *
 * Says so when there is nothing left, rather than drawing an empty grid.
 */
export function StoredFacts({
  fields,
  omit,
  table,
  entryId,
}: {
  fields: Readonly<Record<string, unknown>>
  /** Keys the table already shows as a column. */
  omit?: readonly string[] | undefined
  table?: CollectionName | undefined
  entryId?: string | undefined
}) {
  const hidden = new Set([...BOOKKEEPING, ...(omit ?? [])])
  const shown = Object.entries(fields).filter(
    ([key, value]) =>
      !hidden.has(key) &&
      value !== null &&
      value !== '' &&
      value !== undefined &&
      !(Array.isArray(value) && value.length === 0),
  )
  return (
    <DetailGrid {...(table ? { table } : {})} {...(entryId ? { entryId } : {})}>
      {shown.length === 0 ? (
        // Inside the grid rather than instead of it, so a row whose only extra
        // fact is *who wrote it* still draws the attribution line under this.
        <p className="text-xs text-ink-muted">Nothing else is stored on this row.</p>
      ) : (
        shown.map(([key, value]) => (
          <Fact key={key} label={spaced(key)}>
            {String(value)}
          </Fact>
        ))
      )}
    </DetailGrid>
  )
}
