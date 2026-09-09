/**
 * Whether a value is something to await.
 *
 * Loosely typed on purpose: this reads a caller's return value, not a contract.
 * The dialogs that use it offer the same bargain -- answer nothing and the
 * dialog closes as it always did, answer a promise and it waits before throwing
 * the analyst's work away.
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
  )
}
