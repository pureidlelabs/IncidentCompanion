/**
 * The token that gates claiming a fresh install.
 *
 * A fresh install has no accounts, so anything reaching the port could
 * otherwise make itself the administrator. The token is printed to the console
 * the process runs in, so producing it is proof of having reached the *machine*
 * rather than the socket.
 *
 * **Held in memory, never written to disk.** A restart mints a new one, and
 * nothing survives a claim to be leaked afterwards.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * **16 bytes, hex.** Enough that guessing is not a strategy during the seconds
 * an install is unclaimed, short enough to read off a console and type.
 */
export function mintToken(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Constant-time, so the comparison leaks neither length nor matching prefix.
 *
 * **A null expectation refuses everything**, an empty candidate included: no
 * token means the install is claimed and there is nothing to match, which must
 * not collapse into `'' === ''`.
 */
export function matchesToken(expected: string | null, given: string): boolean {
  if (expected === null) return false

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(given, 'utf8')
  // `timingSafeEqual` throws on a length mismatch, which would itself be a
  // timing signal; the lengths are compared first and deliberately.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
