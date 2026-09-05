/**
 * A value an analyst recorded verbatim, cleaned without losing its layout.
 */
import { z } from 'zod'

import { INVISIBLE } from './invisible.lists.js'

/**
 * Newline and tab: the two invisible characters that are content in a query,
 * a transcript or a pasted result.
 */
const LAYOUT = new Set(['\n', '\t'])

/** A value with everything nobody can see taken out, bar newline and tab. */
export function withoutInvisiblesKeepingLayout(value: string): string {
  return value.replace(INVISIBLE, (char) => (LAYOUT.has(char) ? char : ''))
}

/**
 * Wrap a string schema so a recorded value is cleaned before it is judged.
 */
export function recorded<T extends z.ZodType>(schema: T): T {
  return z.preprocess(
    (value) => (typeof value === 'string' ? withoutInvisiblesKeepingLayout(value) : value),
    schema,
  ) as unknown as T
}
