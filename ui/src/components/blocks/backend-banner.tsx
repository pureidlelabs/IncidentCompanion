/**
 * The one thing on screen when the backend cannot serve.
 */
import { AlertTriangle } from 'lucide-react'

import { isStopping, troubleHeading, troubles } from '@/api/backendHealth'
import { useBackendHealth } from '@/api/useBackendHealth'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function BackendBanner() {
  const { data, isError } = useBackendHealth()
  const wrong = troubles(data)
  const stopping = isStopping(data)

  // **`isError` is its own case**, and it is not the same as a dependency being
  // down: the probe itself failed, so there is no report and the server is
  // likely unreachable entirely. Saying which dependency would be a guess.
  if (!isError && !stopping && wrong.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex justify-center p-4">
      {/* **Opaque, because the pane scrolls under it.** A 10% tint leaning on
          a blur let rows read through the one band on the screen saying the
          server is not answering. The kit's `destructive` variant is a card
          ground with destructive text, which is the tint's whole job without
          the transparency. */}
      <Alert
        variant="destructive"
        className="pointer-events-auto w-[min(32rem,calc(100vw-2rem))] shadow-lg"
        data-testid="backend-banner"
      >
        <AlertTriangle className="size-4" aria-hidden />
        <AlertTitle>
          {isError
            ? 'The server is not responding'
            : stopping
              ? 'The server is shutting down'
              : troubleHeading(wrong)}
        </AlertTitle>
        <AlertDescription>
          {isError ? (
            <p>Nothing can be loaded or saved. Retrying every few seconds.</p>
          ) : stopping ? (
            <p>Work in progress will not be saved once it stops.</p>
          ) : (
            <>
              {/* Only where somebody has written what it costs. A dependency
                  with none is already named in the heading, and a fallback
                  line restated that heading in the next tense down. */}
              {wrong.map((one) =>
                one.consequence === undefined ? null : <p key={one.key}>{one.consequence}</p>,
              )}
              <p>Retrying every few seconds.</p>
            </>
          )}
        </AlertDescription>
      </Alert>
    </div>
  )
}
