/**
 * A request naming a setting the application does not offer stores nothing.
 *
 * *GIVEN a request to set something the application does not offer, WHEN it is
 * made, THEN it is refused, AND nothing is stored.*
 *
 * **The second clause is the one worth a test.** `patchSchema` is `.strict()`
 * and its comment gives the reason -- *a client sending `darkMode` instead of
 * `theme` otherwise gets a 200 and no change, which reads as the server
 * ignoring them* -- so the refusal itself is hard to lose. (That comment says
 * the answer is a 400; it is a 422, which is what the serialising pipe gives a
 * body it will not parse. Asserted as measured rather than as written.) What a refusal that
 * arrived *after* a partial write would look like is identical from the
 * caller's side, and that is what reading the settings back afterwards catches.
 *
 * **The body carries a valid key beside the unknown one**, which is what makes
 * "nothing is stored" mean something: a handler that applied what it recognised
 * and complained about the rest would pass a test whose body was unknown keys
 * alone.
 *
 * **The accepted change is the control.** The same valid key on its own is
 * applied, so the unchanged reading above is the refusal rather than a route
 * that stores nothing at all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

let harness: Harness | null = null
let admin: Persona

interface Appearance {
  theme?: string
  clock?: string
}

const read = async (): Promise<Appearance> =>
  (await (
    await fetch(`${harness!.base}/api/appearance`, { headers: { cookie: admin.cookie } })
  ).json()) as Appearance

const patch = (body: unknown) =>
  fetch(`${harness!.base}/api/appearance`, {
    method: 'PATCH',
    headers: { cookie: admin.cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe.skipIf(!(await bootable()))('a setting the application does not offer', () => {
  let held: Appearance

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    held = await read()
  }, 90_000)

  afterAll(async () => {
    // Put back whatever the account had, since the control below changes it.
    if (harness && held.theme) await patch({ theme: held.theme })
    await harness?.close()
  })

  it('refuses the request', async () => {
    const answer = await patch({ darkMode: true })
    expect(
      answer.status,
      'a setting the application does not offer was accepted, so a client misspelling one ' +
        'is told nothing',
    ).toBe(422)
  })

  it('stores neither the unknown key nor the valid one beside it', async () => {
    const before = await read()
    const wanted = before.theme === 'dark' ? 'light' : 'dark'

    const answer = await patch({ theme: wanted, darkMode: true })
    expect(answer.status, 'the mixed body was accepted').toBe(422)

    expect(
      (await read()).theme,
      'the valid half of a refused body was applied, so a refusal is not the whole answer',
    ).toBe(before.theme)
  })

  it('applies that same valid key on its own', async () => {
    const before = await read()
    const wanted = before.theme === 'dark' ? 'light' : 'dark'

    expect((await patch({ theme: wanted })).status).toBe(200)
    expect(
      (await read()).theme,
      'the key is not settable at all, so the refusals above are not about the unknown one',
    ).toBe(wanted)
  })
})
