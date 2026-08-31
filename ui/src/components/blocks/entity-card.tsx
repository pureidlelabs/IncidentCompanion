import { ArrowUpRight } from 'lucide-react'
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useCollection } from '@/api/case'
import { cardContentOf, referenceCount, type CardTone } from '@/api/entityCard'
import { formForCollection, sectionPathFor, targetOf, type EntityTarget } from '@/api/entityTargets'
import { useSpecs } from '@/api/specs'
import { FieldToneBadge } from '@/components/blocks/severity-badge'
import { MISSING_REFERENCE, type LinkedEntity } from '@/components/ui/entity-ref'
import { HoverCard, HoverCardPanel } from '@/components/ui/hover-card'
import { cn } from '@/lib/cn'

interface EntityCardScope {
  caseId: string
}

const EntityCardContext = createContext<EntityCardScope | null>(null)

/**
 * Mounted once around every section, naming the case the cards read.
 *
 * - Its presence is the promise that a router and a query client are above it,
 *   so the card body calls hooks without guarding for their absence.
 * - With no provider above it, `EntityHoverCard` renders its trigger alone.
 */
export function EntityCardProvider({
  caseId,
  children,
}: {
  caseId: string
  children: ReactNode
}) {
  return <EntityCardContext value={{ caseId }}>{children}</EntityCardContext>
}

/** The open case, or `null` where no provider is mounted. */
export function useEntityCardScope(): EntityCardScope | null {
  return useContext(EntityCardContext)
}

/**
 * The card's chip.
 *
 * **`FieldToneBadge`, not a chip of its own.** The card was a second place
 * `fieldTones` was turned into colour, and it had frozen on the four abstract
 * tone words -- so a hollow classification would have drawn filled here while
 * every table drew it correctly.
 */
function ToneChip({ tone }: { tone: CardTone }) {
  return <FieldToneBadge value={tone.value} tone={tone.tone} />
}

/**
 * The card's contents, mounted on open.
 *
 * Pending and missing are two states and are never collapsed: an id whose
 * collection has not arrived is not a dangling reference.
 */
function EntityCardBody({
  entity,
  caseId,
  target,
}: {
  entity: LinkedEntity
  caseId: string
  target: EntityTarget
}) {
  const specs = useSpecs()
  const rows = useCollection(caseId, target.collection)
  const timeline = useCollection(caseId, 'timeline')

  // One cast, where a typed collection becomes a form's field names.
  // `useCollection` returns a union of twelve row types and `.find` over a
  // union of arrays is not callable; the card reads every field by the name
  // the spec gives it, which is the assertion `fromWire<T>` makes.
  const asRows = (data: unknown) => data as readonly Record<string, unknown>[] | undefined
  const row = asRows(rows.data)?.find((candidate) => candidate.id === entity.id)
  const form = specs.data ? formForCollection(specs.data, target.collection) : undefined
  const content = specs.data && form && row ? cardContentOf(specs.data, form, row) : undefined
  const entries = asRows(timeline.data)
  const links = entries ? referenceCount(entries, entity.id) : undefined
  const settled = rows.isSuccess && specs.isSuccess
  const missing = settled && !row

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'min-w-0 break-words font-mono text-sm font-medium',
            missing && 'italic text-ink-muted',
          )}
        >
          {missing ? MISSING_REFERENCE : entity.name || MISSING_REFERENCE}
        </span>
        {content?.tone && <ToneChip tone={content.tone} />}
      </div>

      <p className="text-2xs uppercase tracking-wide text-ink-muted">
        {target.title}
        {links !== undefined && (
          <>
            {' \u00b7 '}
            {links} {links === 1 ? 'timeline entry' : 'timeline entries'}
          </>
        )}
      </p>

      {missing ? (
        // The id is what identifies it, and what an analyst searches an export
        // or a `.iccase` for.
        <p className="break-all font-mono text-2xs text-ink-muted">{entity.id}</p>
      ) : content ? (
        content.rows.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {content.rows.map((field) => (
              <div key={field.name} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-ink-muted">{field.label}</dt>
                <dd className="line-clamp-2 break-words">{field.value}</dd>
              </div>
            ))}
          </dl>
        )
      ) : (
        <p className="text-xs text-ink-muted">&#x2026;</p>
      )}

      {!missing && (
        <Link
          // `entity.id` carried through as `?highlight=`, so the section
          // scrolls to the row and flashes it rather than landing on whichever
          // page the table sorts to first.
          to={
            sectionPathFor(caseId, entity.target, entity.id) ??
            `/cases/${encodeURIComponent(caseId)}/${target.slug}`
          }
          data-slot="entity-card-open"
          className="inline-flex items-center gap-1 self-start rounded-sm text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Open in {target.title}
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      )}
    </div>
  )
}

/**
 * Wrap any element to give it this entity's card.
 *
 * - It reads and never writes: every control on it is a link.
 * - The trigger is the caller's own element, so wrap something focusable - a
 *   bare `span` is a card no keyboard opens.
 * - The queries live in the body and cost nothing until a card opens.
 * - With no `EntityCardProvider` or no known target, the children render alone.
 *
 * A caller whose trigger is not one of React Aria's own controls -- a canvas,
 * where the thing pointed at is pixels -- wraps its anchor in `Pressable` and
 * drives `open`/`onOpenChange` itself, as `PointerContextMenu` does.
 */
export function EntityHoverCard({
  entity,
  children,
  open,
  onOpenChange,
}: {
  entity: LinkedEntity
  /** A single element, since it is the trigger React Aria attaches to. */
  children: ReactElement
  /** Drive the card from outside instead of from the trigger's own pointer. */
  open?: boolean
  /**
   * The card was dismissed -- Escape, or a click outside it.
   *
   * Required alongside `open`: a card driven from outside with nothing to
   * close it stays over the page and swallows every other click.
   */
  onOpenChange?: (open: boolean) => void
}) {
  const scope = useEntityCardScope()
  const target = targetOf(entity.target)
  if (!scope || !target) return children

  return (
    <HoverCard
      {...(open === undefined ? {} : { isOpen: open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      {children}
      <HoverCardPanel aria-label={entity.name || MISSING_REFERENCE}>
        <div data-slot="entity-card">
          <EntityCardBody entity={entity} caseId={scope.caseId} target={target} />
        </div>
      </HoverCardPanel>
    </HoverCard>
  )
}
