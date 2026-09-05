/**
 * A file digest's algorithm, read from the digest itself.
 */

/** Hex-digest length to STIX's own name for the algorithm. */
const BY_LENGTH: ReadonlyMap<number, string> = new Map([
  [32, 'md5'],
  [40, 'sha1'],
  [64, 'sha256'],
])

/**
 * The algorithm a digest is, or `null` when it is not a digest.
 */
export function hashTypeOf(value: unknown): string | null {
  const digest = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!/^[0-9a-f]+$/.test(digest)) return null
  return BY_LENGTH.get(digest.length) ?? null
}
