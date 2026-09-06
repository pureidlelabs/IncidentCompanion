import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'

import { RouteErrorScreen, SectionErrorScreen } from '@/screens/route-error'

/**
 * The router's error, read here and drawn by the screens tier.
 *
 * **Two boundaries, nested, and which one catches decides what survives.** The
 * outer one replaces the window: the shell itself could not draw, so the rail
 * has gone and the way out is the case list. The inner one sits inside the
 * shell, where one section threw and every other one still works.
 *
 * `useRouteError` is a router hook and cannot be called from a story, which is
 * why the drawing is in `screens/route-error.tsx` and this reads the error and
 * hands it over. The gallery can then show the one screen that by construction
 * only appears when something has already gone wrong.
 */

function detailOf(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${String(error.status)} ${error.statusText}`
  return error instanceof Error ? error.message : String(error)
}

export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()
  const routed = isRouteErrorResponse(error)

  return (
    <RouteErrorScreen
      detail={detailOf(error)}
      {...(error instanceof Error && error.stack !== undefined ? { stack: error.stack } : {})}
      notFound={routed && error.status === 404}
      // 403 only: a 401 is a session signing in fixes, and a 404 may be a
      // case somebody renamed. Both can change by trying again.
      refused={routed && error.status === 403}
      onCases={() => {
        // The case list, not a reload: reloading re-renders the same section
        // and lands here again, and the rail is how you reach one that works.
        void navigate('/cases')
      }}
      onReload={() => {
        globalThis.location.reload()
      }}
    />
  )
}

export function SectionError() {
  const error = useRouteError()
  return (
    <SectionErrorScreen
      detail={detailOf(error)}
      {...(error instanceof Error && error.stack !== undefined ? { stack: error.stack } : {})}
      onReload={() => {
        globalThis.location.reload()
      }}
    />
  )
}
