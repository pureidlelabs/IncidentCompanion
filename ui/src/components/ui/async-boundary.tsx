import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { Button } from './button'

/**
 * An error carrying an HTTP status, structurally rather than by class -
 * the kit does not know its caller's error type, and `ApiError` satisfies
 * this without either side importing the other.
 */
interface HttpStatusError {
  status: number
}

function hasHttpStatus(error: unknown): error is HttpStatusError {
  return (
    typeof error === 'object'
    && error !== null
    && 'status' in error
    && typeof error.status === 'number'
  )
}

/**
 * The three states every query has, rendered one way.
 *
 * Not a React `<Suspense>` + error boundary pair: TanStack Query already
 * models pending/error/data as data, and a thrown error loses the `refetch`
 * that makes a retry button possible. This takes the query result's own flags.
 *
 * **A 409 is not a failure.** `case_api` answers it when nothing is open for
 * editing or more than one thing is - the URL is right and the request is
 * fine, the app is simply not in a state to answer yet, and a client retrying
 * after the analyst opens a case should be encouraged to. It gets its own
 * copy and a retry, not the red treatment.
 */

export interface AsyncBoundaryProps {
  isPending: boolean
  isError: boolean
  error?: unknown
  refetch?: () => void
  /** How many skeleton rows to draw. Match the real list's row height. */
  skeletonRows?: number
  children: ReactNode
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-(--control-h-lg) motion-safe:animate-pulse rounded-md bg-muted"
        />
      ))}
    </div>
  )
}

export function AsyncBoundary({
  isPending,
  isError,
  error,
  refetch,
  skeletonRows = 5,
  children,
}: AsyncBoundaryProps) {
  if (isPending) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading&#x2026;</span>
        <Skeleton rows={skeletonRows} />
      </div>
    )
  }

  if (isError) {
    /**
     * **A refusal is not a failure, and offering to retry one is a lie.**
     * Measured 2026-08-12 in a browser: an analyst opening Accounts got a red
     * alert reading "Insufficient permissions" with *Try again* beside it. The
     * server is right and will refuse every press, so the button invites the
     * analyst to keep pressing a control that keeps failing - and the red says
     * something is broken when nothing is.
     *
     * **403 only.** A 401 is a session that has gone, which signing in fixes;
     * a 404 may be a row somebody else deleted. Those can change. A 403 says
     * *not you*, and that does not change by pressing anything.
     */
    const refused = hasHttpStatus(error) && error.status === 403
    const calm = refused

    return (
      <div
        role={calm ? 'status' : 'alert'}
        className={cn(
          'flex flex-col items-start gap-3 rounded-lg border p-6',
          calm ? 'text-ink-muted' : 'border-destructive/40 text-destructive',
        )}
      >
        {/*
          **No 409 branch here.** This boundary wraps reads, and this server
          answers 409 only on a versioned write. The branch it had said
          "Nothing is open for editing yet", which was the whole-case lock's
          answer and unreachable once the lock went.
        */}
        {/* **Any error's own words, not just an `ApiError`'s.** A caller
            handing this a plain `Error` had its message dropped for the
            generic line, so a screen that knew exactly what had failed said
            nothing. The generic is what is left when there is no message at
            all. */}
        <p className="text-sm">
          {(error instanceof Error ? error.message : '') || 'That did not load.'}
        </p>
        {refetch && !refused && (
          <Button variant="outline" size="sm" onPress={refetch}>
            Try again
          </Button>
        )}
      </div>
    )
  }

  return children
}
