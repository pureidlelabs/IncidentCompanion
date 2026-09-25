/**
 * The built seed entry, run as an install runs it, finishes on a fresh
 * database and exits non-zero, rather than hanging, where it cannot seed.
 *
 * **Built and spawned, not imported**: an install waits on this process
 * exiting, and a hang is only visible to something waiting on the exit.
 */
import { execFile, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bootable } from './app-harness.js'

const SERVER = fileURLToPath(new URL('..', import.meta.url))
const given = process.env.DATABASE_URL ?? ''
const cloneable = Boolean(given) && !process.env.IC_EMBEDDED_DATABASE_URL

/** The seed entry's exit code, or `hung` where it has not exited within `ms`. */
function seeds(env: Record<string, string>, ms = 90_000): Promise<number | 'hung'> {
  return new Promise((answer) => {
    const child = spawn(process.execPath, ['dist/src/seed.js', '--demos'], {
      cwd: SERVER,
      env: { ...process.env, ...env },
      stdio: 'ignore',
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      answer('hung')
    }, ms)
    child.once('exit', (code) => {
      clearTimeout(timer)
      answer(code ?? -1)
    })
  })
}

describe.skipIf(!cloneable || !(await bootable()))('the seed entry', () => {
  let admin: pg.Client
  const clone = `${new URL(given).pathname.slice(1)}_seed_${String(process.pid)}`
  const at = (role: string, database = clone) => {
    const url = new URL(given)
    url.pathname = `/${database}`
    url.username = role
    url.password = role
    return url.toString()
  }

  beforeAll(async () => {
    await promisify(execFile)('npm', ['run', '--silent', 'build'], { cwd: SERVER })
    const { ADMIN_URL, UNCLAIMED } = await import('./global-setup.js')
    admin = new pg.Client({ connectionString: new URL('/postgres', ADMIN_URL).toString() })
    await admin.connect()
    await admin.query(`drop database if exists "${clone}" with (force)`)
    await admin.query(
      `create database "${clone}" template "${new URL(given).pathname.slice(1)}${UNCLAIMED}" owner ic_migrate`,
    )
  }, 180_000)

  afterAll(async () => {
    await admin?.query(`drop database if exists "${clone}" with (force)`)
    await admin?.end()
  })

  it('seeds a fresh install and exits', async () => {
    expect(await seeds({ DATABASE_URL: at('ic_app'), SEED_DATABASE_URL: at('ic_seed') })).toBe(0)
  }, 120_000)

  it('exits non-zero, rather than hanging, where it cannot seed', async () => {
    const nowhere = `${clone}_absent`
    expect(
      await seeds({
        DATABASE_URL: at('ic_app', nowhere),
        SEED_DATABASE_URL: at('ic_seed', nowhere),
      }),
    ).not.toBe(0)
  }, 120_000)
})
