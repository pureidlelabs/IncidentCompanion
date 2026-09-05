/**
 * React Aria's links, given a navigate function.
 */
import type { ReactNode } from 'react'
import { RouterProvider } from 'react-aria-components'

export interface AriaRouterProps {
  /** The router's navigate. Must return void; void a promise at the call site. */
  navigate: (path: string, options?: unknown) => void
  /** The router's `useHref`, so a basename reaches the link. */
  useHref?: ((href: string) => string) | undefined
  children: ReactNode
}

export function AriaRouter({ navigate, useHref, children }: AriaRouterProps) {
  return (
    <RouterProvider navigate={navigate} {...(useHref ? { useHref } : {})}>
      {children}
    </RouterProvider>
  )
}
