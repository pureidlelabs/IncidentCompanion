/**
 * Two analysts press "restore the missing sections" on one report at the same
 * moment, as two overlapping requests, over several rounds.
 *
 * Each required section comes back once, at a position of its own, with a
 * record naming whoever restored it, and both answers are a success: the
 * second restores nothing.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { aCase, blocksOf, caller, type Call } from './report-writers.js'

const runnable = await bootable()
const ROUNDS = 10

describe.skipIf(!runnable)('two restores of one report at once', () => {
  let harness: Harness
  let one: Call
  let other: Call
  let people: Persona[]
  let caseId: string
  let owner: Client

  beforeAll(async () => {
    harness = await boot()
    people = [await sharedAdmin(harness), await sharedAnalyst(harness)]
    one = caller(harness, people[0]!)
    other = caller(harness, people[1]!)
    caseId = await aCase(one, 'Two restores at once')
    owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
  }, 120_000)

  afterAll(async () => {
    await owner?.end()
    await harness?.close()
  })

  it('puts each missing required section back once', async () => {
    const doubled: string[] = []
    for (let round = 0; round < ROUNDS; round++) {
      const made = await one(`/cases/${caseId}/reports`, 'POST', { label: `Round ${String(round)}`, template: 'nis2-final' })
      const { id } = (await made.json()) as { id: string }

      const answers = await Promise.all(
        [one, other].map((who) => who(`/cases/${caseId}/reports/${id}/restore-sections`, 'POST')),
      )
      const restored = await Promise.all(
        answers.map(async (answer) => ((await answer.json()) as { restored?: unknown[] }).restored?.length),
      )
      const blocks = await blocksOf(one, caseId, id)
      const identities = blocks.map((block) => `${block.kind}/${block.heading || block.headingKey}`)
      const positions = blocks.map((block) => block.position)

      expect(answers.map((answer) => answer.ok)).toEqual([true, true])
      expect(restored.filter((count) => count === 0), 'the second restore put something back too').toHaveLength(1)
      if (new Set(identities).size !== identities.length || new Set(positions).size !== positions.length) {
        doubled.push(identities.join(', '))
      }
      const { rows: recorded } = await owner.query<{ actor_id: string }>(
        `select actor_id from change_feed where entity = 'report_blocks' and entity_id = any($1)`,
        [blocks.map((block) => block.id)],
      )
      expect(recorded).toHaveLength(blocks.length)
      expect(recorded.every((row) => people.some((who) => who.id === row.actor_id))).toBe(true)
    }
    expect(doubled).toEqual([])
  }, 120_000)
})
