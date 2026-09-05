/**
 * The token that gates claiming a fresh install.
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
