/**
 * What a language may be called, in one place.
 *
 * **A pack's code and a snippet's translation key are the same vocabulary**, so
 * they are the same rule: a translation filed under a tag no pack can carry is
 * an entry with one fewer language than its author believes, and nothing
 * downstream ever says so. Two copies of this regex would drift into exactly
 * that gap.
 *
 * **The primary subtag is two or three letters, and that bound is the point.**
 * A looser `{2,8}` accepts `dutch`, which is shaped like a tag, is not one, and
 * matches no pack -- the failure is silent in both directions. BCP 47 puts
 * languages at 2-3 (`nl`, `eng`), reserves 4 for scripts and 5-8 for registered
 * subtags, none of which anyone here is coding a report in.
 *
 * Lives in `domain` because `library` and `report` both need it and neither may
 * reach the other.
 */
import { z } from 'zod'

/** `nl`, `eng`, `fr-BE`, `sr-Latn-RS`. Not `dutch`, `nl_NL` or `n`. */
export const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/**
 * `.min(2)` states in the document what the pattern already requires.
 *
 * The reference publishes a generated instance of every body, and the generator
 * reads `minLength` because it cannot read a regex -- without it the published
 * example for a language code is one character, which the route then refuses.
 * A document that describes a body its own door rejects is the defect
 * `documented-bodies` exists to catch, and it caught this.
 */
export const languageTag = z
  .string()
  .trim()
  .min(2)
  .regex(LANGUAGE_TAG, 'A language tag looks like `nl` or `fr-BE`.')
