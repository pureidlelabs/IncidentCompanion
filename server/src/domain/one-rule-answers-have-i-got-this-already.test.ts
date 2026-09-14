/**
 * **Both import doors answer *have I got this already?* about the same row.**
 *
 * `keyOf` gives a row one key; `identitiesOf` gives the ladder of every naming
 * it answers to, strongest first. The spreadsheet door indexed the case by
 * `keyOf` and looked up by `keyOf`; the incident door indexed by the ladder
 * and walked the ladder. -> #604
 *
 * **The count was never the symptom, and this is what it is instead.**
 * `keyOf` is the ladder's weakest rung on every keyed collection, so both
 * doors always agreed about *whether* a row was already held. They disagreed
 * about *which* row it was: a strong rung names one stored row and the weak
 * rung names whichever came first, so a file naming `Dropbox / tenant-b`
 * matched the `tenant-a` row through one door and the `tenant-b` row through
 * the other. An import writing onto the wrong record is worse than one writing
 * twice, and nothing said so.
 *
 * **One index builder is the fix.** `identitiesOf`'s own docstring already
 * claims the doors agree by construction; that holds for the rule and failed
 * for the index. The design record #583 added states the risk in the abstract:
 * *two indexes answering the same question by different rules diverge a field
 * at a time*.
 *
 * **What this does not cover:** what a replace writes once a row is matched on
 * a rung weaker than the file stated, which is `exports/import.service.ts`'s.
 */
import { describe, expect, it } from 'vitest'

import { identitiesOf, indexOf, keyOf, type Known } from './identity.js'

/** Two apps the case already holds, alike but for the instance. */
const STORED = [
  { id: 'tenant-a-row', version: 1, appName: 'Dropbox', instance: 'tenant-a' },
  { id: 'tenant-b-row', version: 2, appName: 'Dropbox', instance: 'tenant-b' },
]

/** What a door finds for a row, walking the ladder strongest first. */
const found = (collection: string, index: ReadonlyMap<string, Known>, row: Record<string, unknown>) =>
  identitiesOf(collection, row)
    .map((identity) => index.get(identity))
    .find((hit) => hit !== undefined)

describe('which row an import decides it already holds', () => {
  it('is the one the arriving row actually names', () => {
    const index = indexOf('cloud_apps', STORED)

    expect(
      found('cloud_apps', index, { appName: 'Dropbox', instance: 'tenant-b' })?.id,
      'the strongest naming the file gave was not in the index, so the import fell to the ' +
        'weakest rung and wrote onto whichever row happened to come first',
    ).toBe('tenant-b-row')
  })

  it('carries the version that row was read at, so a replace cannot overwrite blindly', () => {
    const index = indexOf('cloud_apps', STORED)

    expect(
      found('cloud_apps', index, { appName: 'Dropbox', instance: 'tenant-b' })?.version,
      'the match is reported with another row version, which a replace would present',
    ).toBe(2)
  })

  /**
   * **The weakest rung still resolves**, which is what keeps a row naming less
   * than the case holds from arriving as a second copy.
   */
  it('still matches a row that names less than the case holds', () => {
    const index = indexOf('cloud_apps', STORED)

    expect(found('cloud_apps', index, { appName: 'Dropbox', instance: '' })?.id).toBe(
      'tenant-a-row',
    )
  })

  /**
   * **The floor is what stops a ladder becoming a merge**, and widening the
   * index must not widen that: an account is the pair, so a domainless `admin`
   * must not find `admin@corp.local`.
   */
  it('does not match across a floor the ladder declares', () => {
    const index = indexOf('accounts', [
      { id: 'in-a-domain', version: 1, accountName: 'admin', domain: 'corp.local' },
    ])

    expect(
      found('accounts', index, { accountName: 'admin', domain: '' }),
      'a local account matched one in a domain, which is the merge the floor refuses',
    ).toBeUndefined()
  })

  /**
   * **First wins, on every rung.** The case can hold two rows of one naming,
   * and an import must not pick between them differently on each run.
   */
  it('keeps the first row where two share a weaker naming', () => {
    const index = indexOf('cloud_apps', STORED)

    expect(index.get(keyOf('cloud_apps', { appName: 'Dropbox', instance: '' })!)?.id).toBe(
      'tenant-a-row',
    )
  })
})
