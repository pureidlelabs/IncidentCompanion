import { PlayCircle } from 'lucide-react'

import { Section } from '@/components/blocks/section'
import { ButtonLink } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'

import { PICKER_DEMOS, type DemoRow } from './picker-rows'

/**
 * The worked cases, as tiles rather than rows.
 *
 * **The one list in the picker that is not a table.** Each row carries the
 * summary an analyst chooses by, and a table row truncates that to nothing -
 * so the exception is one design rather than a licence, and two panes share
 * it.
 */
export interface DemosPaneProps {
  /** The demo cases this install seeds. Defaults to a worked set. */
  demos?: readonly DemoRow[]
  /** Where a card goes, from the demo it draws. Required: a card is a door. */
  href: (demo: DemoRow) => string
}

export function DemosPane({ demos = PICKER_DEMOS, href }: DemosPaneProps) {
  return (
    <Section
      title="Demo cases"
      blurb="Rebuilt every time the server restarts. Explore freely; nothing typed into one is kept."
    >
      {demos.length === 0 ? (
        <p className="text-sm text-ink-muted">This install offers no demo cases.</p>
      ) : (
        <div className="grid max-w-5xl gap-3 sm:grid-cols-2">
          {demos.map((demo) => (
            <ButtonLink
              key={demo.id}
              href={href(demo)}
              variant="outline"
              className="h-auto items-start justify-start gap-3 whitespace-normal px-4 py-3.5 text-left"
            >
              <IconTile size="lg" className="mt-0.5">
                <PlayCircle />
              </IconTile>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{demo.title}</span>
                  <span className="text-2xs uppercase tracking-micro text-ink-muted">
                    {demo.scenario} &middot; {demo.scale}
                  </span>
                </span>
                <span className="text-xs font-normal leading-relaxed text-ink-muted">
                  {demo.summary}
                </span>
              </span>
            </ButtonLink>
          ))}
        </div>
      )}
    </Section>
  )
}
