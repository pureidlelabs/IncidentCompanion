/**
 * A value an analyst recorded verbatim, cleaned without losing its layout.
 *
 * **`pasted()` is the wrong wrapper for a query and a transcript**, and it is
 * wrong in a way nothing reports: `INVISIBLE` spans `U+0000-U+001F`, so it
 * takes out newline, tab and carriage return along with the ESC and the NUL.
 * A five-line query put through it comes back as one line while still being a
 * populated string, which is the analyst's own record of what they ran
 * destroyed by the guard meant to protect it.
 *
 * So this is `pasted()` with three characters held back, and nothing else
 * differs. Everything the other module says about normalising rather than
 * refusing holds here unchanged. -> `domain/pasted.ts`
 */
import { z } from 'zod'

import { INVISIBLE } from './invisible.lists.js'

/**
 * Newline and tab: the two invisible characters that are content in a query,
 * a transcript or a pasted result.
 *
 * **A carriage return is not in the set**, so `\r\n` stores as `\n`. One file
 * ending kept as two makes every later diff of the query noise, and no reader
 * can tell which of the two a console produced.
 */
const LAYOUT = new Set(['\n', '\t'])

/** A value with everything nobody can see taken out, bar newline and tab. */
export function withoutInvisiblesKeepingLayout(value: string): string {
  return value.replace(INVISIBLE, (char) => (LAYOUT.has(char) ? char : ''))
}

/**
 * Wrap a string schema so a recorded value is cleaned before it is judged.
 *
 * Cleaning runs **before** the wrapped schema, exactly as in `pasted()`, so
 * `.max()` counts what is actually stored rather than what the paste carried.
 * A non-string is handed on untouched, which is what lets a `.default()`
 * underneath still fire on an absent value.
 */
export function recorded<T extends z.ZodType>(schema: T): T {
  return z.preprocess(
    (value) => (typeof value === 'string' ? withoutInvisiblesKeepingLayout(value) : value),
    schema,
  ) as unknown as T
}
