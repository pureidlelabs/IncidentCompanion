/**
 * The characters an analyst cannot see, which a paste brings along anyway.
 *
 * **Its own module, and it imports nothing**, so the value can travel to the
 * browser: the client advises on a draft before the server ever stores it, and
 * both have to judge the same string. -> `vocabularies.lists.test.ts`
 */

/**
 * The invisible characters that carry no information, so removing one cannot
 * change what a value says.
 *
 * **`U+200C` and `U+200D` are deliberately not here.** The zero-width
 * non-joiner and joiner distinguish two different spellings of a word in
 * Persian and the Indic scripts, so stripping them edits an analyst's evidence
 * rather than cleaning it. Every character below is either unrenderable or
 * changes only the order things are drawn in.
 *
 * **The bidi controls are in the set for a second reason.** They reorder the
 * display without touching the bytes, so `invoice<RLO>gpj.exe` is drawn as
 * `invoiceexe.jpg` while being keyed, exported and searched as the executable
 * it is. In a field a case is keyed on, that is a spoof rather than a paste
 * artefact.
 *
 * **The C0 and C1 control characters are in the set, and one of them is
 * load-bearing.** `collections/identity.ts` joins a composite key with `U+0000`
 * and says nothing in a hostname or an account name can be one. The column
 * stores a NUL happily, so stripping here is what makes that sentence true.
 *
 * **Global, so it reaches the middle of a value.** The edges are what `.trim()`
 * already covers; a line wrapped in a console puts one in the middle.
 */
export const INVISIBLE =
  // eslint-disable-next-line no-control-regex -- the control characters are the point
  /[\u0000-\u001f\u007f-\u009f\u00ad\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g

export function withoutInvisibles(value: string): string {
  return value.replace(INVISIBLE, '')
}
