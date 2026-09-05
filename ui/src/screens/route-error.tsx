import { AlertTriangle, RotateCw } from 'lucide-react'

import { EmptyState } from '@/components/blocks/empty-state'
import { Button } from '@/components/ui/button'

/**
 * What an analyst sees when a screen stops rendering, in its two sizes.
 */
export interface ErrorScreenProps {
  /** The error in one line: a status and its text, or the message. */
  detail?: string
  /** The stack, folded away. Falls back to `detail` when there is none. */
  stack?: string | undefined
  /** A loader's 404 is not a crash, and says something else. */
  notFound?: boolean
  /**
   * The account may not open this.
   */
  refused?: boolean
  /** Leaves for the case list. Without it the offer is not drawn. */
  onCases?: (() => void) | undefined
  /** Reloads the window. */
  onReload?: (() => void) | undefined
}

/** The folded detail, on both sizes. */
function WhatWentWrong({ text }: { text: string }) {
  return (
    <details className="w-full text-left">
      <summary className="cursor-pointer text-xs text-ink-muted">What went wrong</summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-2xs leading-relaxed">
        {text}
      </pre>
    </details>
  )
}

/**
 * The whole window: the shell itself could not draw, so the rail is gone.
 */
export function RouteErrorScreen({
  detail = 'The case is untouched -- nothing is written while a screen is drawing.',
  stack,
  notFound = false,
  refused = false,
  onCases,
  onReload,
}: ErrorScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6" data-testid="route-error">
      <div className="flex w-full max-w-lg flex-col items-center gap-4 rounded-lg border border-destructive/40 p-6">
        <EmptyState
          icon={AlertTriangle}
          title={
            refused
              ? 'You may not open this'
              : notFound
                ? 'There is nothing at this address'
                : 'This screen stopped rendering'
          }
          detail={
            refused
              ? 'This account does not have access to it. Nothing is wrong with the case, and an administrator can grant it.'
              : notFound
                ? 'The link may be from an older version of the app, or the case may have been renamed.'
                : 'The case is untouched \u2014 nothing is written while a screen is drawing, and every save that went through is already stored.'
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onCases !== undefined && <Button onPress={onCases}>Back to your cases</Button>}
              {/* Withheld on a refusal: the server is right and will refuse
                  every press, so the control would invite an analyst to keep
                  pressing a thing that keeps failing. */}
              {onReload !== undefined && !refused && (
                <Button variant="outline" onPress={onReload}>
                  <RotateCw aria-hidden />
                  Reload
                </Button>
              )}
            </div>
          }
        />
        <WhatWentWrong text={stack ?? detail} />
      </div>
    </div>
  )
}

/**
 * The same failure inside the shell, where the rail survived.
 */
export function SectionErrorScreen({
  detail = 'The case is untouched -- nothing is written while a screen is drawing.',
  stack,
  onReload,
}: ErrorScreenProps) {
  return (
    <div
      className="my-6 flex flex-col items-center gap-4 rounded-lg border border-destructive/40 p-6"
      data-testid="section-error"
    >
      <EmptyState
        icon={AlertTriangle}
        title="This section stopped rendering"
        detail="The case is untouched, and the rest of it still works &#x2014; pick another section from the rail."
        action={
          onReload === undefined ? undefined : (
            <Button variant="outline" onPress={onReload}>
              <RotateCw aria-hidden />
              Reload this case
            </Button>
          )
        }
      />
      <WhatWentWrong text={stack ?? detail} />
    </div>
  )
}
