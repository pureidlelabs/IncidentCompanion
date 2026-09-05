/**
 * One analyst's reach altered, named by the analyst it belonged to.
 *
 * A plain function pair rather than Nest injection, mirroring
 * `auth/session-ended.ts` and for the same reason: `access` may not import
 * `live`, where the one listener lives. -> `architecture.test.ts`
 *
 * **Named by the analyst rather than by what changed.** A membership revoked,
 * a level reduced and a customer taken out of a group all alter the same
 * thing - what that analyst reaches - and the listener's answer is the same in
 * every case: make them ask again.
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
