/**
 * The `Written` idiom: a write that answers with a sentence for the analyst.
 *
 * **One schema, because there were three descriptions of it.** `accounts`
 * declared an interface, `library` returned a shape that omitted `ok`, and the
 * client declares a third - `ui/src/api/library.ts`, where `Written` requires
 * `ok: boolean`. Measured 2026-08-11: the library's create and delete answered
 * `{ messages }` with no `ok`, so the client's own type was false for those two
 * routes and nothing could see it, because the response is cast rather than
 * parsed on arrival.
 *
 * **Where it is used and where it is not.** A refusal an analyst can act on
 * carries this shape and a 422, which the client unwraps to show beside the
 * control. A schema failure carries the validation tree instead - see
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
