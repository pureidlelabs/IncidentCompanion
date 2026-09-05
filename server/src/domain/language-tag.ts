/**
 * What a language may be called, in one place.
 */
import { z } from 'zod'

/** `nl`, `eng`, `fr-BE`, `sr-Latn-RS`. Not `dutch`, `nl_NL` or `n`. */
export const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/**
 * `.min(2)` states in the document what the pattern already requires.
 */
export const languageTag = z
  .string()
  .trim()
  .min(2)
  .regex(LANGUAGE_TAG, 'A language tag looks like `nl` or `fr-BE`.')
