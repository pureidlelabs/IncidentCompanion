/**
 * **The one shape a schema refusal carries, and the client contract it owes.**
 *
 * `ui/src/api/client.ts` reads `errors` as a list of issues and answers an
 * empty list for anything else, so a body whose `errors` is not a list reaches
 * the analyst with no field named. Asserted here rather than only there because
 * this is the producing side, and the two trees cannot import each other.
 * -> #633
 *
 * **What this does not cover:** how the client renders them, and whether every
 * route reaches this helper rather than building a body of its own, which is
 * `one-shape-for-a-refusal.rule.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { refusedBody } from './refusals.js'

/** Three ways at once, so one fixture covers a path, a type and a stray key. */
function refused(): z.ZodError {
  const schema = z.object({ title: z.string().min(1), count: z.number() }).strict()
  const parsed = schema.safeParse({ title: '', count: 'lots', extra: 1 })
  if (parsed.success) throw new Error('the fixture parsed, so this asserts nothing')
  return parsed.error
}

describe('the body a schema refusal carries', () => {
  /**
   * **A list, because the reader tests for one.** A tree is an object, and the
   * client's `if (!Array.isArray(issues)) return []` turns it into no fields at
   * all -- which draws a refused write as a dropped connection.
   */
  it('carries its issues as a list', () => {
    const body = refusedBody(refused())

    expect(Array.isArray(body.errors), 'the client reads this as a list and finds none').toBe(true)
  })

  /**
   * **`path`, which is the field.** A message alone names what is wrong and not
   * what it is wrong about, so the analyst is told to look at the whole form.
   */
  it('names the field each issue is about', () => {
    const issues = refusedBody(refused()).errors as { path?: unknown; message?: unknown }[]

    const named = issues
      .filter((issue) => Array.isArray(issue.path) && issue.path.length > 0)
      .map((issue) => (issue.path as unknown[]).join('.'))

    expect(named).toContain('title')
    expect(named).toContain('count')
  })

  /**
   * **An unrecognised key has an empty `path` and its names in `keys`**, which
   * is the one issue the client reads differently. `treeifyError` folds it into
   * an unattributed sentence at the top, so it is the case that proves the tree
   * loses something rather than arranging it.
   */
  it('keeps the names an unrecognised key is about', () => {
    const issues = refusedBody(refused()).errors as { code?: unknown; keys?: unknown }[]

    const stray = issues.find((issue) => issue.code === 'unrecognized_keys')
    expect(stray, 'the stray key is not reported as its own issue').toBeDefined()
    expect(stray?.keys).toEqual(['extra'])
  })
})
