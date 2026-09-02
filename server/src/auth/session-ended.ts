/**
 * One session row gone, named by the user it belonged to.
 *
 * A plain function pair rather than Nest injection: `auth` may not import
 * `live`, where the one listener lives. -> `architecture.test.ts`
 */
type Listener = (userId: string) => void

const listeners = new Set<Listener>()

export function sessionEnded(userId: string): void {
  for (const listen of listeners) listen(userId)
}

/** Returns the function that stops this listener from being called again. */
export function onSessionEnded(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
