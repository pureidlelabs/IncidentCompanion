/**
 * The app's router, handed to React Aria.
 */
import { useCallback } from 'react'
import { Outlet, useHref, useNavigate, type RouteObject } from 'react-router-dom'

import { AriaRouter } from '@/components/ui/aria-router'

function AriaRouting() {
  const navigate = useNavigate()
  // **React Router 7's `navigate` returns a promise; React Aria's expects
  // void.** The promise resolves when the transition settles and no React Aria
  // caller awaits it, so it is voided here, once, rather than at each of the
  // link surfaces that would otherwise inherit the mismatch.
  const go = useCallback(
    (path: string, options?: unknown) => {
      void navigate(path, options as never)
    },
    [navigate],
  )
  return (
    <AriaRouter navigate={go} useHref={useHref}>
      <Outlet />
    </AriaRouter>
  )
}

/** The routes, under one pathless layout that teaches React Aria to navigate. */
export function withAriaRouting(routes: RouteObject[]): RouteObject[] {
  return [{ element: <AriaRouting />, children: routes }]
}
