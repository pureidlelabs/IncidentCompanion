import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

import { Cell, Column, Row, Table, TableBody, TableHeader } from '@/components/ui/table'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { IconTile } from '@/components/ui/icon-tile'
import { Meter } from '@/components/ui/meter'

import {
  bytes,
  healthFigure,
  REDIS_DOWN_NOTE,
  type FigureRow,
  type GaugeRow,
  type ServingRow,
  type TableRow,
} from './picker-rows'
import { Section } from './section'

/**
 * What this install is doing, and whether it is coping.
 */
export interface HealthPaneProps {
  /**
   * How long this server has been up, already worded.
   */
  uptime: string | undefined
  /** Each dependency and whether it is answering. */
  serving: readonly ServingRow[]
  /** This container's quantities against their ceilings. */
  gauges: readonly GaugeRow[]
  /** Database connections held, against the pool. */
  connections: GaugeRow | undefined
  /** The counts worth reading at a glance. */
  figures: readonly FigureRow[]
  /** Which table is the one growing. */
  tables: readonly TableRow[]
}

export function HealthPane({
  uptime,
  serving,
  gauges,
  connections,
  figures,
  tables,
}: HealthPaneProps) {
  // Read off what this install is serving rather than off the label: an
  // install with no Redis row at all is not an install whose Redis is down.
  const redisDown = serving.some((one) => one.label === 'Redis' && !one.up)

  return (
    <Section
      title="Health"
      blurb="What this install is doing, and whether it is coping."
      meta={<span className="font-mono text-xs text-ink-muted">{uptime}</span>}
    >
      <div className="flex max-w-[900px] flex-col gap-6">
        <Frame className="bg-card">
          <FrameHeader>
            <FrameTitle className="text-2xs font-medium uppercase tracking-wider text-ink-muted">
              Serving
            </FrameTitle>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {serving.map((one) => (
                <div
                  key={one.label}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  {/* Shape and word, never hue alone: the row survives a
                      greyscale print and a colour-blind reader. */}
                  <IconTile
                    tone={one.up ? 'muted' : 'destructive'}
                    size="sm"
                    className={one.up ? 'text-action-contain' : undefined}
                  >
                    {one.up ? <CheckCircle2 /> : <XCircle />}
                  </IconTile>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{one.label}</span>
                    <span className="truncate text-xs text-ink-muted">{one.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            {redisDown && <p className="text-xs text-ink-muted">{REDIS_DOWN_NOTE}</p>}
          </FramePanel>
        </Frame>

        <Frame className="bg-card">
          <FrameHeader>
            <FrameTitle className="text-2xs font-medium uppercase tracking-wider text-ink-muted">
              This server
            </FrameTitle>
          </FrameHeader>
          <FramePanel>
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {gauges.map((gauge) => (
                <Gauge key={gauge.label} gauge={gauge} />
              ))}
            </div>
          </FramePanel>
        </Frame>

        <Frame className="bg-card">
          <FrameHeader>
            <FrameTitle className="flex items-baseline gap-2 text-2xs font-medium uppercase tracking-wider text-ink-muted">
              Postgres
              <span className="text-2xs normal-case tracking-normal">postgres:5432/incidentcompanion</span>
            </FrameTitle>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-5">
            {connections !== undefined && (

              <div className="max-w-[440px]">
                <Gauge gauge={connections} />
              </div>

            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {figures.map((figure) => (
                <div key={figure.label} className="flex flex-col gap-0.5">
                  <span className="text-2xs uppercase tracking-wider text-ink-muted">
                    {figure.label}
                  </span>
                  <span className="font-mono text-2xl tabular-nums">{figure.value}</span>
                  {figure.note !== undefined && (
                    <span
                      className={
                        figure.warn === true
                          ? 'flex items-center gap-1 text-2xs text-destructive'
                          : 'text-2xs text-ink-muted'
                      }
                    >
                      {figure.warn === true && <AlertTriangle aria-hidden className="size-3" />}
                      {figure.note}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <Table aria-label="Tables holding rows, largest first">
              <TableHeader>
                <Column isRowHeader>Table</Column>
                <Column>Rows &asymp;</Column>
                <Column>Size</Column>
              </TableHeader>
              <TableBody items={tables.map((one) => ({ ...one, id: one.name }))}>
                {(one) => (
                  <Row id={one.id}>
                    <Cell className="font-mono text-xs">{one.name}</Cell>
                    <Cell className="text-right font-mono text-xs tabular-nums">
                      {one.approximateRows.toLocaleString('en-GB')}
                    </Cell>
                    <Cell className="text-right font-mono text-xs tabular-nums text-ink-muted">
                      {bytes(one.bytes)}
                    </Cell>
                  </Row>
                )}
              </TableBody>
            </Table>
            <p className="sr-only">Tables holding rows, largest first</p>
          </FramePanel>
        </Frame>
      </div>
    </Section>
  )
}

/**
 * One quantity against a known ceiling.
 */
function Gauge({ gauge }: { gauge: GaugeRow }) {
  const over = gauge.used > gauge.total
  return (
    <Meter
      label={gauge.label}
      // The pair, not the percentage the bar already draws: how much room is
      // left is the number somebody acts on.
      valueText={`${healthFigure(gauge.used, gauge.unit)} / ${healthFigure(gauge.total, gauge.unit)}`}
      value={Math.min(gauge.used, gauge.total)}
      maxValue={gauge.total}
      tone={over ? 'breach' : 'default'}
    />
  )
}
