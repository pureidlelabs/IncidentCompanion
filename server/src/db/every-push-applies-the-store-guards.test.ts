/**
 * Every way this tree prepares a database leaves the store's own rules in it.
 *
 * The guards are taken out of the suite's database first, so a push that did
 * not apply them leaves them absent rather than left over from global setup.
 * The shipped one-shot's command and working directory are read from
 * `compose.yaml` rather than restated; the image's `/repo` is this checkout.
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { storeGuards } from './schema/store-guards.js'
import { asRole, isEmbedded } from '../../test/database.js'

const run = promisify(execFile)

const APP_URL = process.env.DATABASE_URL ?? ''
const MIGRATE_URL = APP_URL ? asRole(APP_URL, 'ic_migrate') : ''
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SERVER = fileURLToPath(new URL('../..', import.meta.url))

const TRIGGERS = storeGuards.flatMap((statement) => /create or replace trigger (\w+)/.exec(statement)?.[1] ?? [])

/** The migrate one-shot's `command:` and `working_dir:`, as `compose.yaml` ships them. */
function composeMigrate(): [string, string[], string] {
  const compose = readFileSync(`${ROOT}/compose.yaml`, 'utf8')
  const service = compose.slice(compose.indexOf('\n  migrate:\n'))
  const command = /\n {4}command: (\[.*\])\n/.exec(service)?.[1]
  const dir = /\n {4}working_dir: \/repo(\/\S*)?\n/.exec(service)
  if (!command || !dir) throw new Error('compose.yaml names no command or no /repo working_dir for the migrate service')
  const [program, ...args] = JSON.parse(command) as string[]
  return [program!, args, `${ROOT}${dir[1]?.slice(1) ?? ''}`]
}

async function onMigrate<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: MIGRATE_URL })
  await client.connect()
  try {
    return await work(client)
  } finally {
    await client.end()
  }
}

const present = () =>
  onMigrate(async (client) =>
    (
      await client.query<{ tgname: string }>(
        'select tgname from pg_trigger where not tgisinternal and tgname = any($1) order by tgname',
        [TRIGGERS],
      )
    ).rows.map((row) => row.tgname),
  )

const takeThemOut = () =>
  onMigrate(async (client) => {
    for (const name of TRIGGERS) {
      const { rows } = await client.query<{ relation: string }>(
        'select tgrelid::regclass::text as relation from pg_trigger where tgname = $1',
        [name],
      )
      for (const { relation } of rows) await client.query(`drop trigger ${name} on ${relation}`)
    }
  })

describe.skipIf(!APP_URL || isEmbedded(APP_URL))('preparing a database', () => {
  afterAll(async () => {
    await onMigrate(async (client) => {
      for (const statement of storeGuards) await client.query(statement)
    })
  })

  it('declares triggers, so the cases below are not vacuous', () => {
    expect(TRIGGERS.length).toBeGreaterThan(0)
  })

  it('left them in the suite database', async () => {
    expect(await present()).toEqual([...TRIGGERS].sort())
  })

  const pushes: [string, () => [string, string[], string]][] = [
    ['the push every script runs', () => ['npm', ['run', '--silent', 'db:push'], SERVER]],
    ['the shipped migrate one-shot', composeMigrate],
  ]

  it.each(pushes)('puts them back after %s', async (_name, how) => {
    await takeThemOut()
    expect(await present()).toEqual([])

    const [command, args, cwd] = how()
    await run(command, args, { cwd, env: { ...process.env, DATABASE_URL: MIGRATE_URL } })

    expect(await present()).toEqual([...TRIGGERS].sort())
  }, 120_000)
})
