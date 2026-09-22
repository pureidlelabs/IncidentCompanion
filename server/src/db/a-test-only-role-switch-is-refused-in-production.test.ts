/**
 * `PG_ADOPT_ROLE_FROM_URL` issues `set role` on every connection this pool
 * opens, which restores row-level security under a test engine that hands
 * every client the superuser. It is never a boundary, so a production server
 * reading it is one whose scoping rests on a switch nothing audits. -> #1087
 */
import { afterEach, describe, expect, it } from 'vitest'

import { createPool } from './client.js'

const URL_ = 'postgres://ic_app:ic_app@127.0.0.1:5432/incidentcompanion'

afterEach(() => {
  delete process.env.PG_ADOPT_ROLE_FROM_URL
  delete process.env.NODE_ENV
})

describe('a pool asked to adopt the role in its URL', () => {
  it('refuses to open in production', () => {
    process.env.PG_ADOPT_ROLE_FROM_URL = '1'
    process.env.NODE_ENV = 'production'

    expect(() => createPool(URL_)).toThrow('PG_ADOPT_ROLE_FROM_URL')
  })

  it('opens where the test engine needs it', async () => {
    process.env.PG_ADOPT_ROLE_FROM_URL = '1'
    process.env.NODE_ENV = 'test'

    const pool = createPool(URL_)
    expect(pool).toBeDefined()
    await pool.end()
  })
})
