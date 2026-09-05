import type { ReactNode } from 'react'

import { isEvent, type TimelineEntry } from '@/api/model'
import { type EntityNames } from '@/components/blocks/entity-scope'
import { RowActions } from '@/components/blocks/row-actions'
import { RowMenuItems, type RowMenuGroup } from '@/components/blocks/row-menu'
import { TONE_INK, toneFor, type SeverityTone } from '@/components/blocks/severity-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/blocks/presence'
import { ACTION_CHIP, ACTION_NOUN, ACTION_RAIL, actionClassOf } from '@/lib/action-class'
import { clockOf, durationText } from '@/lib/case-time'
import { cn } from '@/lib/cn'

/**
 * The rail's fill per severity.
 */
const SEVERITY_RAIL: Readonly<Record<SeverityTone, string>> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  info: 'bg-severity-info',
  none: 'border-l border-dashed border-severity-none bg-transparent',
}

/** What paints one entry's rail: its severity, or its activity class. */
function railOf(entry: TimelineEntry): string {
  return isEvent(entry)
    ? SEVERITY_RAIL[toneFor(entry.severity)]
    : ACTION_RAIL[actionClassOf(entry.actionType)]
}

/**
 * A stretch of adjacent timeline entries the analyst reads as one line.
 */
export interface TimelineRunLike {
  /** The entry that leads the run, and the only one drawn while it is folded. */
  lead: TimelineEntry
  /** Every entry in the run, the lead first. */
  members: readonly TimelineEntry[]
}

/**
 * An hour or more with nothing in it, between two rows on the same day.
 */
export function TimelineGapMark({ span }: { span: number }) {
  return (
    <li
      data-slot="timeline-gap"
      className="flex items-center gap-3 border-b border-border px-4 py-1.5"
    >
      <span aria-hidden className="ml-timeline-gutter h-px flex-1 border-t border-dashed border-severity-info/60" />
      <span className="shrink-0 text-2xs text-severity-info">
        {`${durationText(span)} with nothing recorded`}
      </span>
      <span aria-hidden className="h-px flex-1 border-t border-dashed border-severity-info/60" />
    </li>
  )
}

/** `08:40 - 09:19`, earliest first whichever way the list is sorted. */
function runSpanText(run: TimelineRunLike): string {
  const stamps = run.members
    .map((entry) => Date.parse(entry.time))
    .filter((at) => !Number.isNaN(at))
  if (stamps.length < 2) return ''
  const first = Math.min(...stamps)
  const last = Math.max(...stamps)
  if (first === last) return ''
  const clock = (at: number) => {
    const when = new Date(at)
    return `${String(when.getUTCHours()).padStart(2, '0')}:${String(when.getUTCMinutes()).padStart(2, '0')}`
  }
  return `${clock(first)} \u2013 ${clock(last)}`
}

/**
 * One timeline entry, or the head of a run of identical ones.
 */
export function TimelineEntryRow({
  run,
  names,
  open = false,
  folded = false,
  checkbox,
  onToggle,
  menu = [],
  onEdit,
  onDelete,
  onRightClick,
}: {
  run: TimelineRunLike
  names: EntityNames
  open?: boolean
  /** A member of an opened run, drawn under its lead. */
  folded?: boolean
  /** This row's own tick, read back from the shared selection table. */
  checkbox?: ReactNode
  onToggle?: (() => void) | undefined
  /** The row's own menu, drawn on the `...` and on the right click. */
  menu?: RowMenuGroup[]
  onEdit?: (() => void) | undefined
  onDelete?: (() => void) | undefined
  /** Where the pointer was, so the screen can open the menu there. */
  onRightClick?: ((at: { x: number; y: number; id: string }) => void) | undefined
}) {
  const entry = run.lead
  const count = run.members.length
  const span = runSpanText(run)

  return (
    <li
      data-slot="timeline-row"
      data-kind={entry.kind}
      // `group`, not `group/row`: this row is an `<li>` and carries no
      // `data-rac`, so Tailwind's hover variant reaches it through plain
      // `:hover`. The React Aria tables next door need an interactive row
      // instead - see `data-table`'s `rowAction`.
      onContextMenu={(event) => {
        if (menu.length === 0 || !onRightClick) return
        event.preventDefault()
        onRightClick({ x: event.clientX, y: event.clientY, id: entry.id })
      }}
      className={cn(
        'group grid grid-cols-[auto_var(--spacing-timeline-gutter)_3px_minmax(0,1fr)_auto] items-start gap-x-3',
        'border-b border-border py-timeline-card-y px-timeline-card-x last:border-b-0',
        'transition-colors hover:bg-accent/20',
        folded && 'bg-muted/20',
      )}
    >
      <span className="pt-0.5">{checkbox}</span>

      <time
        dateTime={entry.time}
        className={cn(
          'mt-0.5 font-mono text-xs tabular-nums text-ink-muted',
          entry.timeAssumed && 'underline decoration-dashed underline-offset-2',
        )}
      >
        {clockOf(entry.time)}
      </time>

      <span data-slot="timeline-rail" aria-hidden className={cn('h-full min-h-4 rounded-full', railOf(entry))} />

      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-base font-semibold leading-snug">{entry.description}</span>
          {count > 1 && onToggle && (
            <Button
              variant="ghost"
              size="xs"
              aria-expanded={open}
              className="-my-1 py-1 align-baseline text-xs font-normal text-ink-muted"
              onPress={onToggle}
            >
              {open ? 'Group these again' : `\u00d7${String(count)}${span ? ` \u00b7 ${span}` : ''}`}
            </Button>
          )}
        </p>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          {isEvent(entry) ? (
            <Badge
              variant="outlined"
              size="xs"
              className={cn('shrink-0', TONE_INK[toneFor(entry.severity)])}
            >
              {(entry.severity ?? '').trim() || 'unset'}
            </Badge>
          ) : (
            <Badge
              variant="outlined"
              size="xs"
              className={cn('shrink-0', ACTION_CHIP[actionClassOf(entry.actionType)])}
            >
              {ACTION_NOUN[actionClassOf(entry.actionType)]}
            </Badge>
          )}

          {isEvent(entry) ? (
            <>
              <Absent name="phase" value={entry.ukcPhase} />
              <span className="inline-flex items-baseline gap-1.5">
                <Absent name="technique" value={entry.technique} mono />
                <span className="text-ink-muted">{entry.tactic}</span>
              </span>
              <span className="text-ink-muted">{entry.eventSource}</span>
            </>
          ) : (
            <span className="text-ink-muted">{entry.actionType}</span>
          )}

          <Entities entry={entry} names={names} />

          {/* **Chips, not hashtags.** The sigil was doing a real job on a line
              that is otherwise a run of muted words - it said which of them
              the analyst typed rather than derived - and a chip's own edge is
              what replaces it. `soft` rather than the action noun's
              `outlined` a few lines up: same primitive at the same size, so
              this is one chip vocabulary, and a different job, so a keyword is
              not read as the row's class. */}
          {(entry.tags ?? '').trim() !== '' && (
            <span data-slot="timeline-tags" className="flex flex-wrap items-center gap-1">
              {(entry.tags ?? '')
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
                .map((tag) => (
                  <Badge key={tag} variant="soft" size="xs" uppercase={false}>
                    {tag}
                  </Badge>
                ))}
            </span>
          )}
        </p>
      </div>

      {/* Who recorded it, then the row's own controls. Attribution is
          permanent and the controls are not: a column of three buttons on
          every row is the loudest thing on a list nobody is editing, so they
          arrive on hover and on keyboard focus. */}
      <span className="flex shrink-0 items-center gap-1">
        {entry.author.trim() !== '' && (
          <PersonAvatar
            person={{ name: entry.author, you: false }}
            className="size-5 text-[0.625rem]"
          />
        )}
        <RowActions
          label={entry.description || 'entry'}
          {...(onEdit ? { onEdit } : {})}
          {...(onDelete ? { onDelete } : {})}
          {...(menu.length > 0
            ? { menu: <RowMenuItems groups={menu} as="dropdown" /> }
            : {})}
        />
      </span>
    </li>
  )
}

/**
 * A value, or the field's own name where it is missing.
 */
function Absent({ name, value, mono }: { name: string; value?: string | undefined; mono?: boolean }) {
  const text = (value ?? '').trim()
  if (text === '') {
    return <span className="text-ink-muted/70">{`${name} \u2014`}</span>
  }
  return <span className={cn('text-ink', mono === true && 'font-mono text-data')}>{text}</span>
}

/** The hosts and accounts the entry names, in the face they get copied out of. */
function Entities({ entry, names }: { entry: TimelineEntry; names: EntityNames }) {
  const hosts = [entry.sourceSystemId, entry.systemId]
    .map((id) => (typeof id === 'string' ? (names.system.get(id) ?? '') : ''))
    .filter(Boolean)
  const accounts = entry.accountIds
    .map((id) => names.account.get(id) ?? '')
    .filter(Boolean)
  if (hosts.length === 0 && accounts.length === 0) return null

  return (
    <span data-slot="timeline-entities" className="min-w-0 truncate font-mono text-data">
      {hosts.join(' \u2192 ')}
      {hosts.length > 0 && accounts.length > 0 && (
        <span aria-hidden className="px-1.5 text-ink-muted">
          {'\u00b7'}
        </span>
      )}
      {accounts.length > 2
        ? `${accounts.slice(0, 2).join(', ')} +${String(accounts.length - 2)}`
        : accounts.join(', ')}
    </span>
  )
}
