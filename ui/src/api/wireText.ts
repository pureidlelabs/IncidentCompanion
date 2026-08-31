/**
 * Read a string field the generated types call required and the wire may omit.
 *
 * **The types are honest about the server and wrong about the cache.**
 * `useEntryCreate` writes `{...fields, id}` optimistically, and the dialog's
 * `filledFields` drops every blank - so between Save and the server's answer a
 * field the analyst left empty is not `''`, it is *missing*. `entry.tactic.trim()`
 * throws on it, React Router's boundary catches it, and the whole section
 * renders zero rows until a reload fills the fields in.
 *
 * **Shared rather than a fourth private copy.** `rowActions.ts` and
 * `timelineFilter.ts` each grew their own; `TimelineRow` needed the third, and
 * writing `?? ''` inline there is a lint error (`no-unnecessary-condition`)
 * wherever the type still claims the operand cannot be nullish.
 *
 * **It takes `null` as well, because the wire sends it.** A severity is
 * `null` on an unrated event and the key is *absent* on an action - the
 * server's own enum says so, where the generated Python type said `string`.
 * One place to absorb all three spellings of "no value".
 */
export function text(value: string | null | undefined): string {
  return value ?? ''
}
