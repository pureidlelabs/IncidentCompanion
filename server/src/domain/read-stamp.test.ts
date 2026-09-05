/**
 * A published timestamp has to survive the value the column actually hands
 * back: every `timestamp` column reaches a handler as a `Date`, and
 * `z.iso.datetime()` refuses one - *"Invalid input: expected string, received
 * Date"*. `readStamp()` is what accepts both while publishing a string, and
 * this is what holds it there.
 *
 * **`z.date()` is not an alternative.** These schemas are the API document and
 * `toJSONSchema` refuses a date, so the published form has to stay a string
 * while the parser takes either - in the schema, rather than in each handler
 * remembering a helper.
 *
 * **What no other tier can see.** A test calling a controller method directly
 * gets its object back untouched, because `ZodSerializerInterceptor` only runs
 * in an HTTP context - so a schema that would throw on a real row is exercised
 * by nothing but this file and a live request. A stamp no demo fills and no
 * fixture sets is a route that works on every value anyone has tried and on no
 * value the product will produce.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { complianceRecordSchema } from '../compliance/compliance.controller.js'
import { readStamp } from './field-spec.js'

describe('a published timestamp', () => {
  it('takes the Date a timestamp column returns and emits an ISO string', () => {
    const parsed = readStamp().safeParse(new Date('2026-08-13T10:00:00Z'))
    expect(parsed.success && parsed.data).toBe('2026-08-13T10:00:00.000Z')
  })

  it('takes a string unchanged, because a re-parse must not drift', () => {
    // The same value goes through this twice on a write-then-read, and a
    // conversion that only survives one pass is a value that changes on reload.
    const parsed = readStamp().safeParse('2026-08-13T10:00:00Z')
    expect(parsed.success && parsed.data).toBe('2026-08-13T10:00:00Z')
  })

  it('refuses what is neither, rather than coercing it to a plausible date', () => {
    expect(readStamp().safeParse('yesterday').success).toBe(false)
    expect(readStamp().safeParse(1_760_000_000_000).success).toBe(false)
  })

  it('publishes as a string, so the document still describes JSON', () => {
    const published = z.toJSONSchema(z.object({ at: readStamp() }), { io: 'output' })
    const at = (published.properties as Record<string, { type?: string; format?: string }>).at
    expect(at?.type).toBe('string')
    expect(at?.format).toBe('date-time')
  })

  it('is nullable when asked, since an unanswered stamp is a real state', () => {
    expect(readStamp().nullable().safeParse(null).success).toBe(true)
  })
})

describe('the compliance record, which is where this was found', () => {
  const bare = { caseId: '11111111-1111-4111-8111-111111111111', version: 1 }

  it('parses a row whose stamp is set, not only one where every stamp is null', () => {
    // `published()` runs the stored row through this schema on every read, so
    // a refusal here is a 500 on `GET /api/cases/{id}/compliance`. The null
    // case passed throughout; the set case is the one the product produces the
    // moment an analyst answers "became aware".
    const parsed = complianceRecordSchema.safeParse({ ...bare, gdprAwareAt: new Date() })
    expect(parsed.success).toBe(true)
  })

  it('still answers with a string, so the client can read the clock off it', () => {
    const parsed = complianceRecordSchema.parse({ ...bare, gdprAwareAt: new Date('2026-08-13T10:00:00Z') })
    expect(parsed.gdprAwareAt).toBe('2026-08-13T10:00:00.000Z')
  })
})
