/**
 * The `Written` idiom: a write that answers with a sentence for the analyst.
 *
 * **One schema, because a second description of it cannot be caught.** The
 * client casts a response rather than parsing it -- `ui/src/api/library.ts`
 * declares `Written` with `ok: boolean` -- so a route answering a shape
 * without `ok` makes the client's own type false and nothing reports it.
 *
 * **Where it is used and where it is not.** A refusal an analyst can act on
 * carries this shape and a 422, which the client unwraps to show beside the
 * control. A schema failure carries the issues it failed on instead - see
 * `wire/refusals.ts` for which status means which.
 */
import { z } from 'zod'

/**
 * A sentence and how to draw it.
 *
 * **A tuple rather than an object**, because that is the wire the client
 * already reads: `splitWritten` destructures `[text, level]` and files the
 * negatives into the control's problem slot.
 */
export const writtenMessageSchema = z.tuple([
  z.string().describe('What to show the analyst.'),
  z.string().describe("'negative' goes in the control's problem slot; anything else reads as a note."),
])

export const writtenSchema = z.object({
  ok: z.boolean().describe('Whether the write happened. A refusal also carries 422.'),
  messages: z.array(writtenMessageSchema),
})

export type Written = z.infer<typeof writtenSchema>

/**
 * A write that happened, with a sentence to show for it.
 *
 * Pure, and here rather than beside the refusals, because this tier is bundled
 * into the browser and a throwing helper carries Nest with it.
 */
export function written(text: string): Written {
  return { ok: true, messages: [[text, 'positive']] }
}

/**
 * A write refused, with the sentences to show for it.
 *
 * A builder rather than a throw, because a route whose body carries more than
 * `Written` -- the library editor sends the re-rendered form beside it --
 * spreads this instead of spelling the tuple again.
 * `wire/refusals.ts` throws it for everybody else.
 */
export function refused(...texts: string[]): Written {
  return { ok: false, messages: texts.map((text) => [text, 'negative']) }
}
