/**
 * Read a string field the generated types call required and the wire may omit.
 *
 * **Shared rather than a private copy per caller.** Writing `?? ''` inline is
 * a lint error (`no-unnecessary-condition`) wherever the type still claims the
 * operand cannot be nullish.
 *
 * **It takes `null` as well, because the wire sends it.** A severity is
 * `null` on an unrated event and the key is *absent* on an action - the
 * server's own enum says so, where the generated Python type said `string`.
 * One place to absorb all three spellings of "no value".
 */
export function text(value: string | null | undefined): string {
  return value ?? ''
}
