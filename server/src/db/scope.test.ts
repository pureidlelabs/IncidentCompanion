/**
 * That the database itself refuses one case's rows to another.
 *
 * **Every other test here passes with the policies switched off**, because
 * they all scope themselves correctly. This is the one that fails when the
 * control is absent - so its first assertion is about the *role*, not about a
 * row: a superuser ignores every policy and is not bound by `FORCE`.
 */
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withCase } from './scope.js'
import { cases, systems } from './schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('what one case can see of another', () => {
  let mine = ''
  let theirs = ''

  beforeAll(async () => {
    const [a] = await seed!.insert(cases).values({ title: 'Mine' }).returning()
    const [b] = await seed!.insert(cases).values({ title: 'Theirs' }).returning()
    mine = a!.id
    theirs = b!.id
    await seed!.insert(systems).values([
      { caseId: mine, hostname: 'MY-HOST' },
      { caseId: theirs, hostname: 'THEIR-SECRET-HOST' },
    ])
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
    if (seedPool && seedPool !== pool) await seedPool.end()
  })

  /**
   * **The precondition for every other assertion in this file.** A superuser
   * bypasses row-level security entirely, so this suite would go green against
   * a database with no protection at all - which is exactly what was true
   * before the roles were split.
   */
  it('runs as a role the policies actually bind', async () => {
    const answer = (await db!.execute(
      sql`select usesuper from pg_user where usename = current_user`,
    )) as unknown as { rows?: { usesuper: boolean }[] } & { usesuper: boolean }[]

    // Drizzle hands back the driver's own result, whose shape differs between
    // drivers - `rows` on node-postgres, the array itself elsewhere. Read
    // whichever is present rather than pinning one.
    const [row] = answer.rows ?? answer

    expect(row!.usesuper, 'the app must not connect as a superuser').toBe(false)
  })

  it('cannot create a table', async () => {
    await expect(db!.execute(sql`create table smuggled (id int)`)).rejects.toThrow()
  })

  it('sees only the case it is scoped to', async () => {
    const rows = await withCase(db!, mine, (tx) => tx.select().from(systems))

    expect(rows.map((row) => row.hostname)).toEqual(['MY-HOST'])
  })

  /**
   * **The one that matters, and the reason a `where` clause is not a
   * boundary.** Twenty query sites each have to remember to scope themselves.
   * This is what happens at the twenty-first.
   */
  it('sees nothing at all when a query forgets to scope itself', async () => {
    const rows = await db!.select().from(systems)

    expect(rows, 'an unscoped read must return nothing, not everything').toEqual([])
  })

  /**
   * **Writing where you cannot read is the half a read-only test misses.**
   * `USING` governs what comes back; only `WITH CHECK` stops a row going in
   * under another case's id.
   */
  it('cannot write a row into another case', async () => {
    const refused = await withCase(db!, mine, (tx) =>
      tx.insert(systems).values({ caseId: theirs, hostname: 'SMUGGLED' }),
    ).catch((error: unknown) => error)

    // **Asserted on the cause, not on the message.** Drizzle wraps the driver
    // error as "Failed query: ...", so matching what is thrown would pass for
    // any failed insert - including one refused for the wrong reason.
    expect(String((refused as { cause?: unknown }).cause ?? refused)).toContain(
      'row-level security',
    )
  })

  /** The scope is dropped with the transaction, never left on the connection. */
  it('does not leave the scope behind for the next query on that connection', async () => {
    await withCase(db!, mine, (tx) => tx.select().from(systems))

    expect(await db!.select().from(systems)).toEqual([])
  })
})
