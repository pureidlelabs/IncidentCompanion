/**
 * The `Written` idiom: a write that answers with a sentence for the analyst.
 */
import { z } from 'zod'

/**
 * A sentence and how to draw it.
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
