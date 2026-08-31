/**
 * The app's router, handed to React Aria.
 *
 * **A pathless layout route rather than a wrapper in `App.tsx`**, because
 * `useNavigate` only works inside the router -- and wrapping the route array
 * covers a route added later without anybody remembering to.
 *
 * The provider itself is `components/ui/aria-router`: the kit owns the
 * `react-aria-components` import, and this file owns which router is mounted.
 *
 * Three links landed on 2026-08-26 before anybody looked -- the kill chain
 * pivot, the graph's node door and the report's indicator links. Each did a
 * browser navigation, and this app holds a live case socket per case, so a
 * click cost a reconnect.
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
