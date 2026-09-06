import type { ReactNode } from 'react'

/**
 * A picker pane: its heading, and what sits under it.
 *
 * **Every pane wrote this by hand before it existed**, and they had already
 * drifted: a different wrapper element, a different gap, the right-hand
 * control inside the heading row on some and outside it on others, and a blurb
 * set smaller on most and absent on the rest with nothing saying why.
 *
 * The workspace has no equivalent copy because the case frame draws its head
 * once from `RAIL_GROUPS`. This is the picker's version of that, and it stays a
 * separate component rather than being shared with the workspace's: that one
 * is an `h1` over a route's count phrase, this is an `h2` over a pane, and
 * collapsing them would mean one component taking a flag for which it is.
 *
 * **The pane owns its words, not its shape.** Title, blurb and the right-hand
 * control are data; the tiers, the gaps and the baseline alignment are not, and
 * there is no `className` for the same reason `DetailGrid` lost its one.
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
      {/* **`items-start`, not `items-baseline`.** A control in a
          baseline-aligned row contributes its own text baseline, which sits
          lower than a bare heading's - so a pane carrying one draws its title
          further down than a pane without. The drift the block exists to end,
          inside the block. */}
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
