import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

import { toastQueue } from '@/components/blocks/notify'
import { ToastRegion } from '@/components/ui/toast'
import { THEME_PROVIDER } from '@/lib/theme-preference'

/**
 * Everything a screen is mounted inside, in one place, for both callers.
 */
export function AppProviders({
  client,
  ground = true,
  children,
}: {
  client: QueryClient
  /**
   * Whether this caller wants the ground managed here.
   */
  ground?: boolean
  children: ReactNode
}) {
  const inner = (
    <QueryClientProvider client={client}>
      {/* The preference is honoured rather than overridden, so a capture taken
          under `reducedMotion: 'reduce'` is the settled state. */}
      <MotionConfig reducedMotion="user">
        {children}
        <ToastRegion queue={toastQueue} />
      </MotionConfig>
    </QueryClientProvider>
  )

  return ground ? <ThemeProvider {...THEME_PROVIDER}>{inner}</ThemeProvider> : inner
}
