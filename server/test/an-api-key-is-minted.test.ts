/**
 * Minting an API key, and what the install keeps of it.
 *
 * **A key does not sign anything in yet, and that is deliberate.**
 * `enableSessionForAPIKeys` is the plugin option that would make a key in a
 * header authenticate an ordinary request, and the plugin's own type
 * documentation calls it *"not recommended for production use"*. Every route
 * here sits behind one global guard, so a mocked session would hand a key
 * minted to read a case the whole of its holder's reach. What a key may reach
 * is the decision that has to be made before that flag moves. -> issue #74
 *
 * So what is asserted is the half that does not depend on it: a key is minted
 * for the account that asked, the install keeps a hash rather than the key,
 * and the key does not outlive its holder.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { apikey, user } from '../src/db/schema/index.js'

const RUNNABLE = await bootable()

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!RUNNABLE || !db)('minting an API key', () => {
  let harness: Harness
  let holder: Persona
  let holderId: string

  const ISSUED = 'issued-api-key-holder-1234'
  const PASSWORD = 'api-key-holder-password-1234'

  beforeAll(async () => {
    harness = await boot()
    const email = `api-key-holder-${process.pid}@harness.test`

    const admin = await sharedAdmin(harness)
    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'API key holder',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    if (!made.ok) throw new Error(`creating this file's analyst answered ${String(made.status)}`)

    const held = await signIn(harness, email, ISSUED)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: held.cookie },
      body: JSON.stringify({ current: ISSUED, password: PASSWORD, repeat: PASSWORD }),
    })
    if (!changed.ok) throw new Error(`the analyst could not set its own password`)

    holder = await signIn(harness, email, PASSWORD)
    const [row] = await seed!.select().from(user).where(eq(user.email, email))
    holderId = row!.id
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
    await pool?.end()
  })

  const mint = (persona: Persona, name: string) =>
    fetch(`${harness.base}/api/auth/api-key/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: persona.cookie },
      body: JSON.stringify({ name }),
    })

  it('mints a key for the account that asked for it', async () => {
    const answer = await mint(holder, 'first key')
    // **Read once.** `Response` bodies are single-use, so taking the text for
    // a failure message and then parsing it throws over the assertion.
    const text = await answer.text()
    expect(answer.status, text).toBe(200)

    const body = JSON.parse(text) as { key?: string; id?: string }
    expect(body.key, 'the caller was not given a key').toBeTruthy()

    const [stored] = await seed!.select().from(apikey).where(eq(apikey.id, body.id ?? ''))
    expect(stored, 'no row was written for the key').toBeDefined()
    expect(stored!.referenceId, 'the key belongs to somebody else').toBe(holderId)
  }, 60_000)

  /**
   * **The install keeps a hash, and the key is shown once.** A table holding
   * usable keys turns a database copy into every holder's credentials, which
   * is the reason the plugin hashes by default and `disableKeyHashing` is left
   * alone.
   */
  it('keeps a hash rather than the key it handed over', async () => {
    const answer = await mint(holder, 'second key')
    const body = (await answer.json()) as { key: string; id: string }

    const [stored] = await seed!.select().from(apikey).where(eq(apikey.id, body.id))

    expect(stored!.key, 'the key itself is in the table').not.toBe(body.key)
    // The whole row, not the one column: a copy kept anywhere else on it is
    // the same disclosure.
    const serialised = JSON.stringify(stored, (_k, v: unknown) =>
      typeof v === 'bigint' ? String(v) : v,
    )
    expect(serialised, 'the key is stored somewhere on the row').not.toContain(body.key)
  }, 60_000)

  /**
   * **A key must not outlive its holder**, for the reason `session.userId`
   * cascades. Better Auth declares no reference on `referenceId`, so this is
   * the schema's own constraint and nothing in the plugin would notice its
   * absence -- the row would simply stay, naming an account that is gone.
   */
  it('goes when the account it belongs to goes', async () => {
    const email = `api-key-doomed-${process.pid}-${String(Date.now())}@harness.test`
    const admin = await sharedAdmin(harness)
    await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'Doomed holder',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    const doomed = await signIn(harness, email, ISSUED)
    const body = (await (await mint(doomed, 'doomed key')).json()) as { id?: string }
    expect(body.id, 'the doomed account could not mint a key').toBeTruthy()

    await seed!.delete(user).where(eq(user.email, email))

    const left = await seed!.select().from(apikey).where(eq(apikey.id, body.id ?? ''))
    expect(left, 'the key outlived the account it acts for').toHaveLength(0)
  }, 90_000)
})
