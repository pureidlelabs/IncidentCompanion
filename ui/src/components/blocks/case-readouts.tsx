import { useEffect, useState } from 'react'

import { dayNumber } from '@/lib/statutory-clock'
import { whenAgo } from '@/lib/whenAgo'

/**
 * The case's readouts on the header strip: its title, which day of the case
 * this is, and how long ago it was opened.
 *
 * The rail's head already names the reference and the customer, so nothing
 * here repeats them. The clock ticks once a minute; `now` pins it for a test.
 */
export function CaseReadouts({
  title,
  openedAt,
  detectedAt,
  now: pinned,
}: {
  title: string
  openedAt: string
  detectedAt?: string | null | undefined
  now?: number | undefined
}) {
  const [ticked, setTicked] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => {
      setTicked(Date.now())
    }, 60_000)
    return () => {
      clearInterval(timer)
    }
  }, [])
  const now = pinned ?? ticked
  const day = dayNumber(detectedAt, openedAt, new Date(now))
  return (
    <div data-slot="case-readouts" className="flex min-w-0 items-center gap-6 text-rail-ink">
      <span className="min-w-0 truncate text-sm font-medium" title={title}>
        {title}
      </span>
      <Readout label="day" value={String(day)} />
      <Readout label="opened" value={whenAgo(openedAt, now)} />
    </div>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-micro font-medium tracking-micro uppercase text-rail-ink-muted">
        {label}
      </span>
      <span className="font-mono text-data tabular-nums">{value}</span>
    </span>
  )
}
