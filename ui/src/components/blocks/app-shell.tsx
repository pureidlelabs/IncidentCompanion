import type { Ref, ReactNode } from 'react'

import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { usePersistedFlag } from '@/lib/persistedFlag'
import { cn } from '@/lib/cn'

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
  paneClassName,
  paneKey,
  paneRef,
  children,
}: {
  /** The whole rail - its head, its rows and its foot. */
  rail: ReactNode
  /** Where the fold state is kept. */
  collapsedKey: string
  triggerTestId: string
  /** Beside the fold control, hard left. */
  headerStart?: ReactNode | undefined
  /** At the far end of the header. */
  headerEnd?: ReactNode | undefined
  /** Replaces the shell's own `px-6 py-5` inset. */
  paneClassName?: string | undefined
  /** Changing it remounts the pane and resets its scroll. */
  paneKey?: string | undefined
  /** The scrolling pane itself, for a caller that moves its scroll. */
  paneRef?: Ref<HTMLDivElement> | undefined
  children: ReactNode
}) {
  const [collapsed, toggleCollapsed] = usePersistedFlag(collapsedKey, false)

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
            'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]',
            // The inset is the shell's, not each screen's. A pane owns its
            // words and not its shape, so without this every screen sat hard
            // against the rail on one side and the window on the other -- and
            // the first screen to notice would have added its own, which is
            // where two paddings that disagree come from.
            'px-6 py-5',
            paneClassName,
          )}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
