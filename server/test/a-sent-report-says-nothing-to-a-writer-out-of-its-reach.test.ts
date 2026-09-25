/**
 * A part naming another case's sent report, written by an analyst who does not
 * reach that case: through the routes, and as the app role with no route in front.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { aCase, aDraft, caller, type Call } from './report-writers.js'
import { openTestPool } from './database.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`
const SECRET = `Board report ${TAG}`
const NOWHERE = '00000000-0000-4000-8000-000000000000'

describe.skipIf(!(await bootable()))("a part naming a sent report out of the writer's reach", () => {
  let harness: Harness
  let prober: Persona
  let call: Call
  let seed: ReturnType<typeof openTestPool>
  let app: ReturnType<typeof openTestPool>
  let victim = ''
  let theirCase = ''
  let theirReport = ''
  let ourCase = ''
  let ourPart = ''

  beforeAll(async () => {
    harness = await boot()
    prober = await sharedAnalyst(harness)
    call = caller(harness, prober)
    ourCase = await aCase(call, `Probe ${TAG}`)
    ourPart = (await aDraft(call, ourCase, ['Probe'])).blocks[0]!.id

    seed = openTestPool(process.env.SEED_DATABASE_URL!, 'ic_seed')
    app = openTestPool(process.env.DATABASE_URL!, 'ic_app')
    const one = async (statement: string, values: unknown[]) =>
      String((await seed.query<{ id: string }>(statement, values)).rows[0]!.id)
    victim = await one('insert into customers (name) values ($1) returning id', [`Victim ${TAG}`])
    theirCase = await one('insert into cases (title, customer_id) values ($1, $2) returning id', [`Theirs ${TAG}`, victim])
    theirReport = await one('insert into reports (case_id, label) values ($1, $2) returning id', [theirCase, SECRET])
    await seed.query("update reports set sent_at = now(), frozen = '{}'::jsonb, frozen_at = now() where id = $1", [
      theirReport,
    ])
  }, 120_000)

  afterAll(async () => {
    if (victim) {
      await seed.query('delete from cases where customer_id = $1', [victim])
      await seed.query('delete from customers where id = $1', [victim])
    }
    await seed?.end()
    await app?.end()
    await harness?.close()
  })

  /**
   * What the store answers the prober, scoped to their own case, when a part in
   * `caseId` names `reportId` by `write`; and whether the named report could be
   * locked while that transaction stood refused.
   */
  async function storeAnswer(write: 'insert' | 'update', caseId: string, reportId: string) {
    const client = await app.connect()
    try {
      await client.query('begin')
      await client.query(`select set_config('app.case_id', $1, true), set_config('app.principal', $2, true)`, [
        ourCase,
        prober.id,
      ])
      const answer = await client
        .query(
          write === 'insert'
            ? 'insert into report_blocks (case_id, report_id) values ($1, $2)'
            : 'update report_blocks set case_id = $1, report_id = $2 where id = $3',
          write === 'insert' ? [caseId, reportId] : [caseId, reportId, ourPart],
        )
        .then(
          () => ({ code: 'answered' }),
          (error: { code?: string; message?: string; detail?: string }) => ({
            code: error.code,
            message: error.message,
            detail: error.detail,
          }),
        )
      const locked = await seed
        .query('select 1 from reports where id = $1 for update nowait', [reportId])
        .then(
          () => false,
          (error: { code?: string }) => error.code === '55P03',
        )
      return { answer, locked }
    } finally {
      await client.query('rollback')
      client.release()
    }
  }

  it('refuses it at the store as it refuses a report that does not exist, naming nothing and locking nothing', async () => {
    for (const [write, caseId] of [
      ['insert', theirCase],
      ['insert', ourCase],
      ['update', theirCase],
      ['update', ourCase],
    ] as const) {
      const theirs = await storeAnswer(write, caseId, theirReport)
      const nothing = await storeAnswer(write, caseId, NOWHERE)

      expect(theirs.answer, `an ${write} into ${caseId === ourCase ? 'their own' : 'the other'} case`).toEqual(
        nothing.answer,
      )
      expect(theirs.answer.code).toBe('42501')
      expect(JSON.stringify(theirs.answer)).not.toContain(theirReport)
      expect(JSON.stringify(theirs.answer)).not.toContain(SECRET)
      expect(theirs.locked, "the refused write held a lock on the other case's report").toBe(false)
    }
  })

  it('refuses it through the routes, naming nothing of it', async () => {
    for (const caseId of [theirCase, ourCase]) {
      const theirs = await call(`/cases/${caseId}/report_blocks`, 'POST', { reportId: theirReport, heading: 'Probe' })
      const nothing = await call(`/cases/${caseId}/report_blocks`, 'POST', { reportId: NOWHERE, heading: 'Probe' })
      const [said, missing] = [await theirs.text(), await nothing.text()]

      expect(theirs.status, said).toBeGreaterThanOrEqual(400)
      expect(theirs.status).toBe(nothing.status)
      expect(said).not.toContain(theirReport)
      expect(said).not.toContain(SECRET)
      expect(said.replaceAll(theirReport, '')).toBe(missing.replaceAll(NOWHERE, ''))
    }
  })

  it('wrote no part into the sent report', async () => {
    const { rows } = await seed.query('select 1 from report_blocks where report_id = $1', [theirReport])
    expect(rows).toEqual([])
  })
})
