/**
 * A value the type system lost track of, as text -- or nothing.
 *
 * **`String(value)` never fails, which is the problem.** It answers
 * `'[object Object]'` for an object, `'null'` for null and `'7'` for a number,
 * and every one of those is a plausible-looking string that flows on into a
 * filename, a lookup key or a message. The archive builder read a case
 * reference out of a `Record<string, unknown>` and named the file from it;
 * anything but a string produced a filename nobody would recognise, and no
 * test could see it because the value came from a cast rather than a schema.
 *
 * **This is not a parser and does not coerce.** A number is not text -- a
 * technique id of `7` becoming `'7'` reads like a value where the truth is
 * that the field was not filled in. Where a number genuinely is wanted,
 * `String()` at that site says so.
 */
export function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
