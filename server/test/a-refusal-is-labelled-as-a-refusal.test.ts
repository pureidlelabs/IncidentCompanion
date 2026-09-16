/**
 * **A refusal is labelled as what it is, not as what the route was going to
 * send.**
 *
 * `@Header('content-type', ...)` on a handler is applied to the response before
 * the handler body runs, so it survives every exception the body throws. The
 * CSV export declared `text/csv` that way and its own 400 wore the label: a
 * browser offered the refusal as a download, a client parsing by content type
 * choked on JSON it was told was CSV, and the document says that 400 is
 * `application/json`. -> #814
 *
 * **A refusal raised *before* the handler is already right**, which is what
 * isolates the cause rather than the route: `CaseAccessGuard` answers an
 * unknown case as JSON on the same path, because the decorator has not been
 * applied yet. So the asserted pair is one route, two refusals, arriving from
 * either side of the decorator.
 *
 * **The successful export is asserted in the same file**, because the cheap way
 * to pass this test is to stop labelling the CSV at all.
 *
 * **What this does not cover:** the two `@Header` routes in
 * `docs.controller.ts`, which serve the reference viewer's own page and script
 * and raise nothing from inside the handler -- there is no refusal there to
 * mislabel.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, seedDemoContent, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('the CSV export', () => {
  let harness: Harness
  let admin: Persona
  let realCase: string

  beforeAll(async () => {
    harness = await boot()
    await seedDemoContent(harness)
    admin = await sharedAdmin(harness)
    const cases = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string }[]
    realCase = cases[0]!.id
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  const get = (path: string) =>
    fetch(`${harness.base}${path}`, { headers: { cookie: admin.cookie } })

  it('labels a collection nobody has as JSON, which is what it sends', async () => {
    const answered = await get(`/api/cases/${realCase}/nonsense.csv`)

    expect(answered.status).toBe(400)
    expect(answered.headers.get('content-type')).toMatch(/^application\/json/)
    // The sentence is a good one and is not what was wrong; asserted so a fix
    // that answered JSON by dropping the message would not pass.
    expect((await answered.json() as { message?: string }).message).toContain('nonsense')
  }, 30_000)

  it('still labels the rows it does send as CSV', async () => {
    const answered = await get(`/api/cases/${realCase}/systems.csv`)

    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toMatch(/^text\/csv/)
  }, 30_000)

  it('labels a case nobody has as JSON, from the guard that runs first', async () => {
    // The control: this refusal was already right, and it is what says the
    // defect is the decorator rather than the route.
    const answered = await get('/api/cases/00000000-0000-4000-8000-000000000000/systems.csv')

    expect(answered.status).toBe(404)
    expect(answered.headers.get('content-type')).toMatch(/^application\/json/)
  }, 30_000)
})
