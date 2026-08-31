/**
 * A file digest's algorithm, read from the digest itself.
 *
 * **One implementation, because there were two.** The export route and the
 * client's indicator collector each carried their own, differing in the type
 * they answered with, in whether they lowercased, and in one of them indexing
 * a bare object by length -- which answers for `constructor` as readily as for
 * `32`. A digest names its own algorithm, so nothing should be asking twice.
 *
 * **This file imports nothing**, so the client can value-import it;
 * `vocabularies.lists.test.ts` holds that for every `*.lists.ts`.
 */

/** Hex-digest length to STIX's own name for the algorithm. */
const BY_LENGTH: ReadonlyMap<number, string> = new Map([
  [32, 'md5'],
  [40, 'sha1'],
  [64, 'sha256'],
])

/**
 * The algorithm a digest is, or `null` when it is not a digest.
 *
 * **Case-folded, so the same file is one indicator however it was typed.** A
 * digest is hex, and hex is case-insensitive -- unlike an indicator's value,
 * where lowercasing a URL would be half a normalisation.
 */
export function hashTypeOf(value: unknown): string | null {
  const digest = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!/^[0-9a-f]+$/.test(digest)) return null
  return BY_LENGTH.get(digest.length) ?? null
}
