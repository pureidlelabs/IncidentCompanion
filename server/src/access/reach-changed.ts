/**
 * One analyst's reach altered, named by the analyst it belonged to.
 */
type Listener = (userId: string) => void

const listeners = new Set<Listener>()

export function reachChanged(userId: string): void {
  for (const listen of listeners) listen(userId)
}

/** Returns the function that stops this listener from being called again. */
export function onReachChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
