/** What the environment schema answers for a value nobody set. -> #1087 */
import { describe, expect, it } from 'vitest'

import { loadEnv } from './env.js'

const ENOUGH = {
  DATABASE_URL: 'postgres://ic_app:ic_app@127.0.0.1:5432/incidentcompanion',
  REDIS_URL: 'redis://127.0.0.1:6379',
  AUTH_SECRET: 'x'.repeat(32),
  AUTH_BASE_URL: 'https://127.0.0.1:8443',
  NODE_ENV: 'test',
}

describe('the environment this process was given', () => {
  it('answers for evidence storage when nothing names it', () => {
    expect(loadEnv({ ...ENOUGH }).EVIDENCE_DIR).toBe('.evidence')
  })

  it('keeps the directory an operator did name', () => {
    expect(loadEnv({ ...ENOUGH, EVIDENCE_DIR: '/srv/evidence' }).EVIDENCE_DIR).toBe('/srv/evidence')
  })
})
