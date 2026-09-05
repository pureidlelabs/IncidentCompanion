import type { ReactNode } from 'react'

/**
 * A picker pane: its heading, and what sits under it.
 */
export function Pane({
  title,
  blurb,
  meta,
  actions,
  children,
}: {
  title: string
  /** One line, under the title. Say the consequence, never the rationale. */
  blurb?: string
  /** Beside the title - a version, a count. Not a control. */
  meta?: ReactNode
  /** The pane's own control, right-aligned on the heading's baseline. */
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div data-slot="pane" className="flex flex-col gap-4">
      {/* **`items-start`, not `items-baseline`.** A 32px control in a
          baseline-aligned row contributes its own text baseline, which sits
          lower than a bare heading's - so the two panes carrying a Reload
          button drew their title 4px further down than the six without one,
          measured 92px against 88px. The drift the block exists to end, inside
          the block. */}
      <div
        data-slot="pane-head"
        className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1"
      >
        {/* The blurb sits *under* the title, not after it: "An environment
            variable overrides anything set here." on the heading's own line
            reads as part of the heading. `min-w-0` so a long one wraps inside
            this column rather than pushing the actions off the row. */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {meta}
          </div>
          {blurb && <p className="text-xs text-ink-muted">{blurb}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}
