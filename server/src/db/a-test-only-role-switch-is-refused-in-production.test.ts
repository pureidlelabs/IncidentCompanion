/**
 * `PG_ADOPT_ROLE_FROM_URL` issues `set role` on every connection this pool
 * opens: a switch for a test engine, never a boundary. -> #1087
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPool } from './client.js'

const URL_ = 'postgres://ic_app:ic_app@127.0.0.1:5432/incidentcompanion'

/** Restored rather than deleted: `--pool=threads` shares `process.env` with the next file. */
let had: Record<string, string | undefined> = {}

beforeEach(() => {
  had = {
    NODE_ENV: process.env.NODE_ENV,
    PG_ADOPT_ROLE_FROM_URL: process.env.PG_ADOPT_ROLE_FROM_URL,
  }
})

afterEach(() => {
  for (const [name, value] of Object.entries(had)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
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
