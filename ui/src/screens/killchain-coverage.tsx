import { Layers } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Case } from '@/api/model'
import type { Specs } from '@/api/specs'
import { DataTable, useEntityTable, type EntityColumn } from '@/components/blocks/data-table'
import { EmptyState } from '@/components/blocks/empty-state'
import { FieldToneBadge, held } from '@/components/blocks/severity-badge'
import { Section } from '@/components/blocks/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Link } from '@/components/ui/link'
import { cn } from '@/lib/cn'

import { timelinePath } from '@/components/blocks/case-paths'
import {
  abbreviatePhase,
  coverageOf,
  CYCLE_FILL,
  type Coverage,
  type CoveragePhase,
} from './killchain-phases'

/**
 * Whether the kill chain is accounted for on this case.
 */
export interface KillchainCoverageScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  /**
   * The case is still being read.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

/** A coverage row, which is a phase with an id the grid can key on. */
interface CoverageRow extends CoveragePhase {
  id: string
}

export function KillchainCoverageScreen({
  kase,
  specs,
  busy = false,
  problem,
  onRetry,
}: KillchainCoverageScreenProps) {
  const coverage = useMemo(
    () => (kase && specs ? coverageOf(kase, specs) : undefined),
    [kase, specs],
  )
  const phases = coverage?.phases ?? []
  const rows = useMemo<CoverageRow[]>(
    () => (coverage?.phases ?? []).map((phase) => ({ ...phase, id: phase.phase })),
    [coverage],
  )
  const reached = phases.filter((phase) => phase.observed).length
  const missed = phases.filter((phase) => !phase.observed)

  const columns = useMemo(() => coverageColumns(kase?.id ?? ''), [kase?.id])
  const table = useEntityTable<CoverageRow>({
    data: rows,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })

  return (
    <Section
      title="Kill chain coverage"
      meta={
        <Badge variant="outlined" size="xs">
          {`${String(reached)} of ${String(phases.length)} reached`}
        </Badge>
      }
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
    >
      {phases.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No kill chain phases in this install"
          detail="There is nothing to account for until this install carries phases."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Ribbon phases={phases} />
          <p className="text-sm text-ink-muted">
            {`Reached ${String(reached)} of ${String(phases.length)} kill chain phases.`}
            {missed.length > 0 && missed.length < phases.length && (
              <>
                {' Not observed: '}
                <b className="font-medium text-ink">
                  {missed.map((phase) => phase.phase).join(', ')}
                </b>
                .
              </>
            )}
            {missed.length === phases.length && ' None observed yet.'}
          </p>

          {coverage && <Absences coverage={coverage} />}

          <DataTable
            table={table}
            scroll="page"
            className="[&_table]:min-w-[52rem]"
            label="Kill chain coverage"
            empty={<EmptyState title="Nothing to account for" />}
          />
        </div>
      )}
    </Section>
  )
}

/**
 * The chain as one strip: eighteen cells, filled where the case reached them.
 */
function Ribbon({ phases }: { phases: readonly CoveragePhase[] }) {
  return (
    // **The strip scrolls sideways rather than squeezing.** Eighteen cells
    // need about 36rem to letter; below that the abbreviations lose characters
    // with no ellipsis to say so, which is a phase name that reads as a
    // different phase. The pane scrolls the page, so the scroller is here.
    <div className="overflow-x-auto">
      <ol
        data-slot="killchain-ribbon"
        aria-label="Kill chain phases reached"
        className="flex min-w-[36rem] list-none gap-[3px] p-0"
      >
        {phases.map((phase) => (
          <li
            key={phase.phase}
            title={phase.observed ? phase.phase : `${phase.phase} \u2014 not observed`}
            aria-label={`${phase.phase}: ${phase.observed ? 'observed' : 'not observed'}`}
            style={phase.observed ? { flexGrow: 2.4 } : undefined}
            className={cn(
              'flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded-sm px-1',
              'text-[9px] font-semibold whitespace-nowrap',
              phase.observed
                ? cn(CYCLE_FILL[phase.cycle], 'text-on-severity')
                // The token, not the token at three quarters. This branch never
                // inverts -- the observed one carries its own fill and its own
                // ink -- so the opacity was dimming a colour already chosen for
                // being dim, and made a sixth grey out of the one.
                : 'border border-dashed border-border text-ink-muted',
            )}
          >
            {!phase.observed && (
              <span aria-hidden className="size-1 shrink-0 rounded-full bg-current" />
            )}
            <span className="truncate">{abbreviatePhase(phase.phase)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * What the chain cannot account for, one control each.
 */
function Absences({ coverage }: { coverage: Coverage }) {
  // **`data-testid`, not `data-slot`.** The kit's `Button` writes its own
  // `data-slot="button"` after spreading the caller's props, so a slot passed
  // here is silently dropped and every marker reads as absent.
  const [open, setOpen] = useState<string | null>(null)
  const plural = (many: readonly string[], one: string, some: string) =>
    many.length === 1 ? one : `${String(many.length)} ${some}`

  const rows: { slot: string; label: string; names: readonly string[]; title?: string }[] = []
  if (coverage.unplaced.length > 0) {
    rows.push({
      slot: 'coverage-unplaced',
      label: `${String(coverage.unplaced.length)} of ${String(coverage.hostTotal)} hosts not on the chain`,
      names: coverage.unplaced,
    })
  }
  if (coverage.thin.length > 0) {
    rows.push({
      slot: 'coverage-thin',
      label: plural(coverage.thin, '1 phase rests on one host', 'phases rest on one host'),
      names: coverage.thin,
      title: 'Either the intrusion was that narrow, or patient zero is all anyone examined',
    })
  }
  if (coverage.notAPhase.length > 0) {
    rows.push({
      slot: 'coverage-not-a-phase',
      label: plural(
        coverage.notAPhase,
        '1 event sits outside the chain',
        'events sit outside the chain',
      ),
      names: coverage.notAPhase,
      title: 'Recorded against policy violation, which the chain has no stage for',
    })
  }
  if (coverage.untagged.length > 0) {
    rows.push({
      slot: 'coverage-untagged',
      label: plural(coverage.untagged, '1 event carries no phase', 'events carry no phase'),
      names: coverage.untagged,
    })
  }
  if (coverage.hidden.length > 0) {
    rows.push({
      slot: 'coverage-hidden',
      label: `${String(coverage.hidden.length)} hidden from the graph`,
      names: coverage.hidden,
    })
  }
  if (rows.length === 0) return null

  const shown = rows.find((row) => row.slot === open)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {rows.map((row) => (
          <Button
            key={row.slot}
            data-testid={row.slot}
            variant="ghost"
            size="sm"
            aria-expanded={open === row.slot}
            className={cn(open === row.slot && 'bg-muted text-ink')}
            onPress={() => {
              setOpen(open === row.slot ? null : row.slot)
            }}
            {...(row.title === undefined ? {} : { title: row.title })}
          >
            {row.label}
          </Button>
        ))}
      </div>
      {shown && (
        <ul
          data-testid="coverage-names"
          aria-label={shown.label}
          className="flex list-none flex-wrap gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2"
        >
          {/* Two events can carry one title, so the position is part of the key. */}
          {shown.names.map((name, at) => (
            <li key={`${name}-${String(at)}`} className="font-mono text-data text-ink-muted">
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The table's columns, closed over the case the pivot has to name.
 */
function coverageColumns(caseId: string): EntityColumn<CoverageRow>[] {
  return [
    {
      accessorKey: 'phase',
      header: 'Phase',
      meta: { className: 'w-[16rem]' },
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-bold',
              row.original.observed
                ? cn(CYCLE_FILL[row.original.cycle], 'text-on-severity')
                : 'bg-muted text-ink-muted ring-1 ring-inset ring-border',
            )}
          >
            {row.original.num}
          </span>
          {/* **The entries behind this phase, which is what the row is read
            for.** An unobserved phase gets no door: there is nothing to look
            at, and a link landing on an empty list reads as the analyst's own
            filter being wrong rather than as the case's silence.

            A link rather than the app's button, because it navigates - so it
            middle-clicks into a second tab, which is how a coverage table is
            actually worked through. */}
          {row.original.observed ? (
            <Link
              variant="quiet"
              standalone
              className="truncate"
              href={timelinePath(caseId, row.original.phase)}
            >
              {row.original.phase}
            </Link>
          ) : (
            <span className="truncate text-ink-muted">{row.original.phase}</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'observed',
      header: 'State',
      meta: { className: 'w-[9rem]' },
      cell: ({ row }) =>
        row.original.observed ? (
          <FieldToneBadge
            value="observed"
            tone={held('critical', 'solid')}
            className="whitespace-nowrap"
          />
        ) : (
          <FieldToneBadge value="not observed" tone={undefined} className="whitespace-nowrap" />
        ),
    },
    {
      id: 'hosts',
      accessorFn: (row) => row.hosts.length,
      header: 'Hosts',
      meta: { className: 'w-[6rem] text-right' },
      cell: ({ row }) => (
        <span className="block tabular-nums">
          {row.original.hosts.length > 0 ? row.original.hosts.length : '\u2014'}
        </span>
      ),
    },
    {
      accessorKey: 'entries',
      header: 'Entries',
      meta: { className: 'w-[6rem] text-right' },
      cell: ({ row }) => (
        <span className="block tabular-nums">
          {row.original.entries > 0 ? row.original.entries : '\u2014'}
        </span>
      ),
    },
    {
      id: 'evidence',
      header: 'Evidence',
      enableSorting: false,
      cell: ({ row }) => {
        if (!row.original.observed) {
          return <span className="text-xs text-ink-muted">&#x2014;</span>
        }
        const hosts = row.original.hosts
        const techniques = row.original.techniques
        return (
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate font-mono text-data">{hosts.slice(0, 2).join(', ')}</span>
            {hosts.length > 2 && (
              <span className="text-xs text-ink-muted">{`+${String(hosts.length - 2)}`}</span>
            )}
            {techniques.length > 0 && (
              <span className="truncate font-mono text-2xs text-ink-muted">
                {techniques.slice(0, 2).join(' ')}
                {techniques.length > 2 ? ` +${String(techniques.length - 2)}` : ''}
              </span>
            )}
          </span>
        )
      },
    },
  ]
}
