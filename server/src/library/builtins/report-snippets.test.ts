/**
 * The shipped snippets, checked against the schema that stores them.
 */
import { describe, expect, it } from 'vitest'

import { BUILTIN_REPORT_SNIPPETS } from './report-snippets.js'
import { reportSnippetSchema } from '../kinds.js'

describe('the snippets this app ships', () => {
  it('carries the entries lifted from the Python tier', () => {
    expect(BUILTIN_REPORT_SNIPPETS).toHaveLength(56)
  })

  it.each(BUILTIN_REPORT_SNIPPETS.map((one) => [one.name, one] as const))(
    '%s parses against the payload schema',
    (_name, snippet) => {
      const parsed = reportSnippetSchema.safeParse(snippet.payload)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    },
  )

  it('gives every entry a name, a label and prose', () => {
    for (const one of BUILTIN_REPORT_SNIPPETS) {
      expect(one.name, 'name').toMatch(/^[a-z0-9-]+$/)
      expect(one.label.length, one.name).toBeGreaterThan(0)
      expect(one.payload.body.length, one.name).toBeGreaterThan(40)
    }
  })

  it('names each entry once, since the upsert keys on it', () => {
    const names = BUILTIN_REPORT_SNIPPETS.map((one) => one.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('files them under slots the picker can offer', () => {
    // Eight, from the groups the Python entries carried. A ninth arriving by
    // accident is a chip nobody designed for.
    const slots = new Set(BUILTIN_REPORT_SNIPPETS.map((one) => one.payload.slot))
    expect([...slots].sort()).toEqual([
      'caveats', 'detection', 'email', 'exec_summary',
      'governance', 'hardening', 'identity', 'recovery',
    ])
  })

  it('ships none of them translated, and says so rather than pretending', () => {
    // None of the 56 had a `[nl]` table. The Dutch pass the packs got is owed
    // here too, and a coverage figure that read anything but 0 would be lying.
    const translated = BUILTIN_REPORT_SNIPPETS.filter(
      (one) => Object.keys(one.payload.translations).length > 0,
    )
    expect(translated).toEqual([])
  })
})
