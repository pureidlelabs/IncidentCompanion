/**
 * That every demo row is a row the API would accept.
 *
 * **The seeder writes straight to the database**, so it never meets the Zod
 * schema the write path validates with. A demo value outside a vocabulary
 * stores cleanly, renders on screen, and is refused the first time an analyst
 * opens that row and saves it - which reads as the *save* being broken, and
 * which nothing else in the suite can see.
 *
 * **Parsed against the same schema the route uses**, never a copy.
 */
import { describe, expect, it } from 'vitest'

import { DEMO_CONTENT } from './content.js'
import { COLLECTION_SCHEMAS } from '../domain/collections.js'
import { actionWriteSchema, eventWriteSchema } from '../domain/entities/timeline.js'
import { patchSchema } from '../domain/field-spec.js'

/**
 * Content key -> the schema a row of it is written under.
 *
 * The content is keyed by the *model's* name (`cloudApps`) and the registry by
 * the wire's (`cloud_apps`), so the two are joined here rather than assumed
 * equal - they are not.
 */
const BY_KEY: Record<string, keyof typeof COLLECTION_SCHEMAS> = {
  methods: 'methods',
  systems: 'systems',
  accounts: 'accounts',
  networkIndicators: 'network_indicators',
  malware: 'malware',
  cloudApps: 'cloud_apps',
  evidence: 'evidence',
  impact: 'impact',
  actions: 'actions',
  caseNotes: 'casenotes',
}

/**
 * Fields the seeder resolves before the insert, which a raw row cannot carry.
 *
 * A reference is a *demo key* in the content (`fs01`) and a uuid in the
 * database; an offset is `atMinute` and a timestamp in the column. Stripping
 * them is what makes the rest checkable - the alternative is not checking any
 * of it.
 */
function seedable(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith('Minute')) continue
    if (key.endsWith('Id') || key.endsWith('Ids')) continue
    out[key] = value
  }
  return out
}

describe('every demo row is one the write path would accept', () => {
  const rows: [string, string, Record<string, unknown>][] = []
  for (const content of DEMO_CONTENT) {
    for (const [key, collection] of Object.entries(BY_KEY)) {
      const group = (content as unknown as Record<string, unknown>)[key] as
        | Record<string, Record<string, unknown>>
        | undefined
      if (!group) continue
      for (const [name, row] of Object.entries(group)) {
        rows.push([`${content.reference}.${key}.${name}`, collection, row])
      }
    }
  }

  it('has demo rows to check at all', () => {
    // Without this the loop below passes on an empty list, which is what a
    // renamed content key would produce.
    expect(rows.length).toBeGreaterThan(100)
  })

  it.each(rows)('%s parses', (_where, collection, row) => {
    const schema = COLLECTION_SCHEMAS[collection]!
    const parsed = patchSchema(schema).safeParse(seedable(row))
    expect(
      parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    ).toEqual([])
  })

  /**
   * The timeline separately, because its shape depends on `kind` and it has no
   * entry in `COLLECTION_SCHEMAS` for exactly that reason.
   */
  it('writes timeline entries the union accepts', () => {
    const problems: string[] = []
    for (const content of DEMO_CONTENT) {
      for (const [index, entry] of (content.timeline ?? []).entries()) {
        const schema = entry['kind'] === 'action' ? actionWriteSchema : eventWriteSchema
        const parsed = patchSchema(schema).safeParse(seedable(entry))
        if (!parsed.success) {
          problems.push(
            `${content.reference}.timeline[${index}]: ` +
              parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join(', '),
          )
        }
      }
    }
    expect(problems).toEqual([])
  })
})
