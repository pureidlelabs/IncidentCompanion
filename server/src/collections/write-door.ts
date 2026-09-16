/**
 * What every collection route reads off the wire, declared once so the two
 * doors cannot answer one request differently.
 *
 * The statuses are `wire/refusals.ts`'s, applied rather than imported:
 * `architecture.test.ts` refuses `collections/` reaching that directory.
 */
import { UnprocessableEntityException } from '@nestjs/common'
import { z } from 'zod'

import { rowVersion } from '../domain/column-bounds.js'
import { refusedBody } from '../domain/refusal.js'

/**
 * Rows one request may carry, because the door is reachable from a script:
 * high enough never to refuse an analyst, low enough that one request cannot
 * hold a transaction open over the whole table.
 */
export const BULK_LIMIT = 1000

export const bulkBodySchema = z.object({ entries: z.array(z.unknown()).max(BULK_LIMIT) }).strict()

/**
 * Parse a body by hand, or throw a 422 carrying `message` and the flat list of
 * Zod issues under `errors` - where the global pipe sends a tree.
 *
 * For a route taking `@Body() body: unknown` because its schema depends on
 * something the pipe cannot know: the collection, or the row's kind.
 */
export function parsed(schema: z.ZodType, body: unknown): Record<string, unknown> {
  const answer = schema.safeParse(body)
  if (!answer.success) {
    throw new UnprocessableEntityException(refusedBody(answer.error))
  }
  return answer.data as Record<string, unknown>
}

/**
 * A version out of the query string, where a delete names it. `NaN` for
 * anything that is not digits, which the caller refuses.
 *
 * **Digits before `Number`**, which on its own accepts empty, signed, spaced,
 * exponent and hexadecimal spellings and hands back an integer `rowVersion()`
 * is then satisfied by. -> `every-door-answers-a-version-alike.test.ts`
 */
function fromQuery(value: unknown): number {
  return /^\d+$/.test(String(value)) ? Number(value) : Number.NaN
}

/**
 * The version the caller says it read, or a refusal at 422.
 *
 * **Never 409**, which says somebody wrote first: malformed and stale are
 * separate entries in the list a refusal has to tell apart, and only the
 * second is worth a merge review. -> `openspec/specs/the-api/spec.md`
 */
export function versionRead(value: unknown, act: 'patch' | 'delete'): number {
  const version = act === 'delete' ? fromQuery(value) : value
  if (!rowVersion().safeParse(version).success) {
    throw new UnprocessableEntityException({
      message: `A ${act} has to name the version it read.`,
    })
  }
  return version as number
}
