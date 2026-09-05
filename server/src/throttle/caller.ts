/**
 * Which address a rate limit counts against.
 */

/** `NODE_ENV`. Only the exact value `production` puts a proxy in front. */
export type Mode = string

/**
 * The address to count against, or `null` when there is none to trust.
 */
export function callerAddress(
  headers: Record<string, string | string[] | undefined>,
  socket: string | undefined,
  mode: Mode,
): string | null {
  if (mode === 'production') {
    const real = headers['x-real-ip']
    const one = Array.isArray(real) ? real[0] : real
    return typeof one === 'string' && one.trim() !== '' ? one.trim() : null
  }
  // No proxy in the dev loop, so the socket is the caller.
  return typeof socket === 'string' && socket.trim() !== '' ? socket.trim() : null
}

/**
 * **A caller with no address is counted as one bucket per route, not as one
 * bucket for everybody.**
 */
export const NO_ADDRESS = 'no-address'
