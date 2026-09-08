import type { Ref, ReactNode } from 'react'

import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { usePersistedFlag } from '@/lib/persistedFlag'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/cn'

/**
 * How much of the shell's inset the pane keeps.
 *
 * A value rather than a class, because the inset and the sticky offset that
 * cancels it are one decision: a caller able to replace the padding alone
 * takes the offset with it and does not know. -> #306
 */
export type PaneInset = 'frame' | 'none'

/**
 * The signed-in frame: a folding rail, a header bar, and the scrolling pane.
 *
 * - `rail` is a `Rail`, mounted inside the provider so its rows can read the
 *   fold state.
 * - Fold state persists under `collapsedKey`, shared by every screen using the
 *   same key.
 * - `SidebarInset` renders the page's `main`; the pane inside it is a `div`, so
 *   there is one landmark rather than two.
 * - The fold control sits in the header, outside the rail it acts on.
 * - `paneKey` remounts the pane, which resets its scroll between screens.
 */
export function AppShell({
  rail,
  collapsedKey,
  triggerTestId,
  headerStart,
  headerEnd,
  paneInset = 'frame',
  paneKey,
  paneRef,
  children,
}: {
  /** The whole rail - its head, its rows and its foot. */
  rail: ReactNode
  collapsedKey: string
  triggerTestId: string
  /** Beside the fold control, hard left. */
  headerStart?: ReactNode | undefined
  headerEnd?: ReactNode | undefined
  /** The pane's inset: the shell's own, or none for a screen that fills it. */
  paneInset?: PaneInset | undefined
  paneKey?: string | undefined
  /** The scrolling pane itself, for a caller that moves its scroll. */
  paneRef?: Ref<HTMLDivElement> | undefined
  children: ReactNode
}) {
  // **Folded by default where the rail does not fit, and no further.** At
  // 414px the rail held its 15rem and the inset kept 174px, so the header's
  // controls spilled and the page scrolled sideways -- the rail is what has
  // to give, and it already knows how. This is the fallback only: an analyst
  // who unfolds it is remembered, on any width, which is what keeps a fold
  // the viewport chose from becoming one it enforces.
  const [collapsed, toggleCollapsed] = usePersistedFlag(collapsedKey, useIsMobile())

  return (
    <SidebarProvider
      className="h-full"
      open={!collapsed}
      onOpenChange={() => {
        toggleCollapsed()
      }}
    >
      {rail}
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6 text-xs text-ink-muted">
          <SidebarTrigger testId={triggerTestId} />
          {headerStart}
          {/* Always drawn, so a screen with nothing at the far end still puts
              its header start hard left rather than centring it. */}
          <div className="flex-1" />
          {headerEnd}
        </header>
        <div
          data-slot="pane-scroll"
          key={paneKey}
          {...(paneRef === undefined ? {} : { ref: paneRef })}
          className={cn(
            // `relative`, or the pane clips nothing that is positioned. An
            // absolute box takes its containing block from the nearest
            // positioned ancestor, and a static scroller is not one: every
            // visually-hidden span a row checkbox carries was laid out
            // against the initial containing block, so the document grew with
            // the list while the pane itself scrolled correctly.
            'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto',
            // **The inset and the offset that cancels it, in one expression.**
            // A sticky offset is measured from the padding edge, so what
            // sticks to this pane clears exactly this inset -- and the pane
            // declares it, because a sticky element cannot know it landed
            // here. Written as one choice rather than two classes a caller
            // could override singly: a screen that replaced the padding and
            // left the offset behind pinned its filter bar above the
            // scrollport's own edge. -> #306
            //
            // The inset is the shell's, not each screen's. A pane owns its
            // words and not its shape, so without this every screen sat hard
            // against the rail on one side and the window on the other -- and
            // the first screen to notice would have added its own, which is
            // where two paddings that disagree come from.
            paneInset === 'none'
              ? 'p-0 [--sticky-top:0px]'
              : 'px-(--pane-inset-x) py-(--pane-inset-y) [--sticky-top:var(--pane-sticky-top)]',
          )}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
