/**
 * **The CSV preview decides *have I got this already?* by the rule the server
 * decides it by.**
 *
 * The preview is what an analyst approves, so a preview that says *new* over a
 * row the server will merge is worse than either answer alone: they accept an
 * import believing it adds rows, and it updates them. -> #604
 *
 * **`keyOf` is not the ladder's weakest rung, which is what made this
 * invisible.** Measured on this tree: a `network_indicators` row with a value
 * and a scope and no type has a `keyOf` that is not in its ladder at all, and
 * a `malware` row with a filename and no hash has `keyOf` null against a
 * one-rung ladder. Both doors agreed only on the collections where the two
 * happened to coincide.
 *
 * **What this does not cover:** what the server writes once a row is matched,
 * which is `exports/import.service.ts`'s and is a different question.
 */
import { describe, expect, it } from 'vitest'

import type { MalwareEntry, SystemEntry } from '@/api/model'
import { formSpec } from '@/api/specs'
import { specsFixture } from '@/fixtures/specs'
import { parseCsvTable } from '@/lib/csv'
import { indexOf, matchIn } from '@contract/identity'

import { buildPreview } from './csv-import'

/** A fixture table, refused loudly rather than typed away. */
const parsed = (text: string) => {
  const table = parseCsvTable(text)
  if (table === null) throw new Error(`this fixture is not a table: ${text}`)
  return table
}

const malwareForm = formSpec<MalwareEntry>(specsFixture, 'MALWARE_FIELDS')
const systemForm = formSpec<SystemEntry>(specsFixture, 'SYSTEM_FIELDS')

/** What the server would answer for the same row against the same case. */
const serverSays = (collection: string, held: readonly Record<string, unknown>[], row: Record<string, unknown>) =>
  matchIn(collection, indexOf(collection, held), row) !== undefined

describe('a CSV row the case may already hold', () => {
  /**
   * **A binary with no hash is the ordinary case, not an edge one.** Sentinel's
   * `Malware` entity carries a name and no hash, and `filename` is required
   * where `hash` defaults to empty.
   */
  it('is flagged for a malware row named without a hash, as the server flags it', () => {
    const held = [{ id: 'm-1', filename: 'svchost.exe', family: 'Emotet' }]
    const table = parsed('filename,family\nsvchost.exe,Qakbot\n')

    const preview = buildPreview(table, malwareForm, 'malware', held as never)

    expect(
      preview.rows[0]?.duplicate,
      'the preview called it new because `keyOf` is null without a hash, and the server ' +
        'matched it on the filename rung -- so the analyst approves an add and gets a merge',
    ).toBe(serverSays('malware', held, { filename: 'svchost.exe', family: 'Qakbot' }))
  })

  /**
   * **Two rows in one file, matched against each other.** The preview indexes
   * its own rows as it goes, and must do so by the same rule.
   */
  it('is flagged for a second malware row of one name within the file', () => {
    const table = parsed('filename,family\nsvchost.exe,Emotet\nsvchost.exe,Qakbot\n')

    const preview = buildPreview(table, malwareForm, 'malware', [])

    expect(preview.rows[0]?.duplicate).toBe(false)
    expect(
      preview.rows[1]?.duplicate,
      'the second row of one filename is offered as a new row, and the server merges it',
    ).toBe(true)
  })

  /**
   * **The weak rung must not widen the answer either.** A row naming a host the
   * case does not hold is new through both doors.
   */
  it('is not flagged for a row the case does not hold', () => {
    const held = [{ id: 's-1', hostname: 'WKS-1' }]
    const table = parsed('hostname\nWKS-2\n')

    const preview = buildPreview(table, systemForm, 'systems', held as never)

    expect(preview.rows[0]?.duplicate).toBe(false)
    expect(serverSays('systems', held, { hostname: 'WKS-2' })).toBe(false)
  })

  it('is flagged for a row the case does hold', () => {
    const held = [{ id: 's-1', hostname: 'WKS-1' }]
    const table = parsed('hostname\nWKS-1\n')

    const preview = buildPreview(table, systemForm, 'systems', held as never)

    expect(preview.rows[0]?.duplicate).toBe(true)
    expect(serverSays('systems', held, { hostname: 'WKS-1' })).toBe(true)
  })
})
