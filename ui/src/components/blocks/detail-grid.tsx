import { createContext, useContext, type ReactNode } from 'react'

import { editedLabel, stampFor, type Attribution } from '@/api/attribution'
import type { CollectionName } from '@/api/model'
import { cn } from '@/lib/cn'

/**
 * Who last wrote each row, for every expanded panel at once.
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
        // **The surface is the block's, not the caller's.** It carried a
        // `className` for one release and Timeline used it to add a 66px
        // margin, 16px of padding and its own background - so the panel was
        // nominally the shared component and measurably a different design.
        // Where it sits is the caller's; how it looks is not.
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
