/**
 * **The routes hand back what the service answered, under the shape the
 * document publishes.**
 *
 * The service was covered and the three route handlers were not: each could be
 * deleted, renamed, or wired to the wrong method with every test still green.
 * A route that answers the wrong question is the same defect as a service that
 * does, and only one of the two was being asked. -> #208, #600
 *
 * **The service is a stub here on purpose.** What the service computes is
 * asserted against a real database in
 * `what-an-administrator-can-see-they-granted.test.ts`; what is asserted here
 * is the wiring -- that each handler calls the method its name claims, passes
 * the parameter it was given, and returns it under the key the response schema
 * declares.
 */
import { describe, expect, it } from 'vitest'

import { ReachController } from './reach.controller.js'
import { GroupsController } from './groups.controller.js'
import type { Granted } from './reach.service.js'

const GRANTED: Granted = { by: 'group', groupId: 'g-1', groupName: 'Day shift' }

/** Records which question was asked, and of whom. */
function recorder() {
  const asked: { what: string; of: string }[] = []
  const reach = {
    reachOf: (userId: string) => {
      asked.push({ what: 'reachOf', of: userId })
      return Promise.resolve([
        { customerId: 'c-1', customerName: 'Acme NV', level: 'write', granted: GRANTED },
      ])
    },
    reachTo: (customerId: string) => {
      asked.push({ what: 'reachTo', of: customerId })
      return Promise.resolve([
        {
          userId: 'u-1',
          username: 'alex@example.test',
          displayName: 'Alex',
          level: 'delete',
          granted: GRANTED,
        },
      ])
    },
  }
  return { asked, reach }
}

describe('the reach routes', () => {
  it('asks what one account reaches, of the account it was given', async () => {
    const { asked, reach } = recorder()

    const answer = await new ReachController(reach as never).ofAccount('u-7')

    expect(asked, 'the handler asked the wrong question, or asked it of the wrong id').toEqual([
      { what: 'reachOf', of: 'u-7' },
    ])
    expect(
      answer.reaches,
      'the answer is not under the key the response schema declares',
    ).toHaveLength(1)
    expect(answer.reaches[0]?.granted, 'the provenance is dropped on the way out').toEqual(GRANTED)
  })

  it('asks who reaches one customer, of the customer it was given', async () => {
    const { asked, reach } = recorder()

    const answer = await new ReachController(reach as never).ofCustomer('c-9')

    expect(asked).toEqual([{ what: 'reachTo', of: 'c-9' }])
    expect(answer.reachedBy[0]?.username, 'the answer is empty or under the wrong key').toBe(
      'alex@example.test',
    )
  })
})

describe('the group membership route', () => {
  it('asks for the membership of the group it was given', async () => {
    const asked: string[] = []
    const groups = {
      membership: (groupId: string) => {
        asked.push(groupId)
        return Promise.resolve({ members: [], customers: [] })
      },
    }

    const answer = await new GroupsController(groups as never, {} as never).membership('g-3')

    expect(asked, 'the handler asked about the wrong group').toEqual(['g-3'])
    expect(answer, 'the membership is not handed back whole').toEqual({
      members: [],
      customers: [],
    })
  })
})
