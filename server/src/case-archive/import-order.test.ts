/**
 * That the importer writes a referenced row before the row that names it.
 *
 * **The remap is built as rows are inserted**, so the write order *is* the
 * correctness condition: a row written before its target finds nothing, and a
 * scalar becomes null while a list member is silently dropped. Nothing goes
 * red -- the import reports the same row count and the case comes back with
 * links missing.
 *
 * **Derived from the schemas, not from a second list**, so a new reference
 * field is covered without touching this file.
 */
import { describe, expect, it } from 'vitest'

import { TABLES } from './import.service.js'
import { COLLECTION_SCHEMAS } from '../domain/collections.js'
import { referenceFieldsOf } from '../domain/references.js'
import { reportBlockSchema } from '../domain/entities/report.js'
import { actionWriteSchema, eventWriteSchema } from '../domain/entities/timeline.js'

/**
 * A collection's name as the archive spells it.
 *
 * The archive uses the table's TypeScript name and the domain uses the wire
 * spelling, so every collection whose two spellings differ is named here,
 * alongside the ones that map to themselves. This is a spelling map rather
 * than a fact about references -- getting it wrong makes a test throw, not
 * pass quietly.
 */
const ARCHIVE_NAME: Record<string, string> = {
  network_indicators: 'networkIndicators',
  cloud_apps: 'cloudApps',
  report_blocks: 'reportBlocks',
  casenotes: 'casenotes',
  timeline: 'timeline',
}

const archiveName = (collection: string): string => ARCHIVE_NAME[collection] ?? collection

const HOLDERS: [string, Parameters<typeof referenceFieldsOf>[0]][] = [
  ...Object.entries(COLLECTION_SCHEMAS),
  ['timeline', eventWriteSchema],
  ['timeline', actionWriteSchema],
  ['report_blocks', reportBlockSchema],
]

const POSITION = new Map(TABLES.map(([name], index) => [name as string, index]))

describe('the order the archive importer writes tables in', () => {
  it('knows where every collection that holds a reference is written', () => {
    const missing = HOLDERS.map(([holder]) => archiveName(holder)).filter(
      (name) => !POSITION.has(name),
    )
    expect(missing, 'a holder the importer never writes cannot be ordered').toEqual([])
  })

  it('writes every referenced collection before the one that names it', () => {
    const violations: string[] = []

    for (const [holder, schema] of HOLDERS) {
      const at = POSITION.get(archiveName(holder))
      if (at === undefined) continue

      for (const { field, target } of referenceFieldsOf(schema)) {
        const targetAt = POSITION.get(archiveName(target))
        if (targetAt === undefined) {
          violations.push(`${holder}.${field} points at ${target}, which the importer never writes`)
          continue
        }
        // Equal is fine: a self-reference resolves within the same pass,
        // because `remap` is written row by row as the collection is walked.
        if (targetAt > at) {
          violations.push(`${holder}.${field} needs ${target}, written after it`)
        }
      }
    }

    expect(violations, 'a reference resolved before its target exists is silently lost').toEqual([])
  })
})
