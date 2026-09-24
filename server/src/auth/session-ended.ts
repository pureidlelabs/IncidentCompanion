/**
 * One session row gone, named by the user it belonged to and its own id.
 *
 * A plain function pair rather than Nest injection: `auth` may not import
 * `live`, where the one listener lives. -> `architecture.test.ts`
 */
type Listener = (userId: string, sessionId: string) => void

const listeners = new Set<Listener>()

export function sessionEnded(userId: string, sessionId: string): void {
  for (const listen of listeners) listen(userId, sessionId)
}

export function onSessionEnded(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
