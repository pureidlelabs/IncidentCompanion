/**
 * **Both import doors pick the same stored row for one arriving row.**
 *
 * A case can hold two rows sharing a weak rung -- `Dropbox / tenant-a` and
 * `Dropbox / tenant-b` both answer to bare `Dropbox` -- because no column
 * constraint enforces an identity. Which of the two a bare `Dropbox` matches
 * is then a choice, and each door was making it separately: the spreadsheet
 * door keeps the first, the incident door's index overwrote and kept the last.
 * An analyst importing the same app through the two screens updated two
 * different records. -> #604
 *
 * **What this does not cover:** whether first is the right one to keep. That
 * is `domain/identity.ts`'s rule and is asserted where the rule lives; this
 * asserts only that the two doors read it from there rather than each
 * deciding.
 */
import { describe, expect, it } from 'vitest'

import { ImportService } from './import.service.js'
import { definitions as defs } from './targets.js'
import { indexOf, matchIn } from '../domain/identity.js'

/** Two apps the case already holds, alike but for the instance. */
const STORED = [
  { id: 'tenant-a-row', version: 1, appName: 'Dropbox', instance: 'tenant-a' },
  { id: 'tenant-b-row', version: 2, appName: 'Dropbox', instance: 'tenant-b' },
]

/** A Sentinel incident naming the app with no instance of its own. */
const incident = () => ({
  key: 'inc-1',
  title: 'One app',
  severity: '',
  alerts: [],
  entities: [
    {
      kind: 'CloudApplication',
      id: 'e-app',
      name: 'e-app',
      properties: { appName: 'Dropbox' },
    },
  ],
})

const rig = () => ({
  list: (def: { name: string }) => Promise.resolve(def.name === 'cloud_apps' ? STORED : []),
  createAcross: () => Promise.resolve({ ids: {} }),
  createMany: () => Promise.resolve({ ids: [], unlinked: 0 }),
})

describe('two stored rows sharing a weaker naming', () => {
  it('are read the same way by both import doors', async () => {
    const service = new ImportService(rig() as never)

    const plan = await service.preview('case-1', [incident()], defs())
    const app = plan.entities.find((one) => one.collection === 'cloud_apps')

    expect(app, 'the preview proposed no app, so there is nothing to compare').toBeDefined()

    const spreadsheetDoor = matchIn('cloud_apps', indexOf('cloud_apps', STORED), {
      appName: 'Dropbox',
    })

    expect(
      app?.existing,
      'the two doors matched the bare name against different stored rows, so importing ' +
        'one app through the two screens updates two records',
    ).toBe(spreadsheetDoor?.id)
  })
})
