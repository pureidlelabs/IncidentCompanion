/**
 * Print every demo row the write path would refuse, and why.
 *
 * The test says *that* a row fails; this says which field, across all of them
 * at once, which is what you need to decide whether the data or the vocabulary
 * is wrong.
 *
 *     npx tsx scripts/demo-parse.ts
 */
import { DEMO_CONTENT } from '../src/demos/content.js'
import { COLLECTION_SCHEMAS } from '../src/domain/collections.js'
import { actionWriteSchema, eventWriteSchema } from '../src/domain/entities/timeline.js'
import { patchSchema } from '../src/domain/field-spec.js'

const BY_KEY: Record<string, string> = {
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

const seedable = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row).filter(
      ([key]) => !key.endsWith('Minute') && !key.endsWith('Id') && !key.endsWith('Ids'),
    ),
  )

const seen = new Map<string, number>()
const note = (what: string) => seen.set(what, (seen.get(what) ?? 0) + 1)

for (const content of DEMO_CONTENT) {
  for (const [key, collection] of Object.entries(BY_KEY)) {
    const group = (content as unknown as Record<string, unknown>)[key] as
      | Record<string, Record<string, unknown>>
      | undefined
    if (!group) continue
    for (const row of Object.values(group)) {
      const parsed = patchSchema(COLLECTION_SCHEMAS[collection]!).safeParse(seedable(row))
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          note(`${collection}.${issue.path.join('.')}: ${String(row[issue.path[0] as string])}`)
        }
      }
    }
  }
  for (const entry of content.timeline ?? []) {
    const schema = entry['kind'] === 'action' ? actionWriteSchema : eventWriteSchema
    const parsed = patchSchema(schema).safeParse(seedable(entry))
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        note(`timeline.${issue.path.join('.')}: ${String(entry[issue.path[0] as string])}`)
      }
    }
  }
}

for (const [what, count] of [...seen].sort()) console.log(String(count).padStart(4), what)
