/**
 * The schema step `compose.yaml` runs as `migrate`, run as compose runs it,
 * against a scratch database with the real roles.
 *
 * **The command is read from `compose.yaml`**, so what is attacked here is the
 * step an install runs rather than a function beside it. `/repo` is the image's
 * checkout, which is this repository.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asRole, isEmbedded } from './database.js'

const REPO = fileURLToPath(new URL('../../', import.meta.url))
const ADMIN_URL = process.env.ADMIN_DATABASE_URL ?? ''
const APP_URL = process.env.DATABASE_URL ?? ''
const SCRATCH = 'ic_schema_step_test'
const scratchUrl = (role: string): string => asRole(new URL(`/${SCRATCH}`, ADMIN_URL).toString(), role)

/** The migrate service's command and working directory, as compose.yaml states them. */
function migrateStep(): { argv: string[]; cwd: string } {
  const compose = readFileSync(`${REPO}compose.yaml`, 'utf8')
  const block = /^ {2}migrate:\n((?: {4}.*\n|\s*\n)*)/m.exec(compose)?.[1] ?? ''
  const command = /^ {4}command: (\[.*\])$/m.exec(block)?.[1]
  if (!command) throw new Error('compose.yaml declares no one-line `command:` array for migrate')
  const workdir = /^ {4}working_dir: (\S+)$/m.exec(block)?.[1] ?? '/repo'
  return { argv: JSON.parse(command) as string[], cwd: workdir.replace(/^\/repo\/?/, REPO) || REPO }
}

interface Ran {
  code: number
  out: string
}

/**
 * Runs the step against the scratch database, optionally behind a terminal.
 * Standard input is closed, as it is for a one-shot compose starts detached.
 */
function step(terminal = false): Promise<Ran> {
  const { argv, cwd } = migrateStep()
  const behind = !terminal
    ? argv
    : process.platform === 'darwin'
      ? ['script', '-q', '-e', '/dev/null', ...argv]
      : ['script', '-q', '-e', '-c', argv.map((word) => `'${word}'`).join(' '), '/dev/null']
  const [file, ...args] = behind as [string, ...string[]]
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      env: { ...process.env, DATABASE_URL: scratchUrl('ic_migrate') },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 45_000,
    })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.on('close', (code, signal) => resolve({ code: code ?? -1, out: signal ? `${out}\n(${signal})` : out }))
  })
}

async function query<T extends Record<string, unknown>>(
  url: string,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    return (await client.query<T>(sql, values)).rows
  } finally {
    await client.end()
  }
}

const POLICIES = `select count(*)::int as n from pg_policies where schemaname = 'public'`

/**
 * `work`, with the policy count read every few milliseconds as a separate
 * session would see it. Returns the lowest count seen.
 */
async function watchingPolicies<T>(work: () => Promise<T>): Promise<{ result: T; lowest: number }> {
  const watcher = new Client({ connectionString: new URL(`/${SCRATCH}`, ADMIN_URL).toString() })
  await watcher.connect()
  let lowest = Number.POSITIVE_INFINITY
  let done = false
  const watching = (async () => {
    while (!done) {
      const { rows } = await watcher.query<{ n: number }>(POLICIES)
      lowest = Math.min(lowest, rows[0]!.n)
    }
  })()
  try {
    const result = await work()
    return { result, lowest }
  } finally {
    done = true
    await watching
    await watcher.end()
  }
}

const admin = (): string => new URL(`/${SCRATCH}`, ADMIN_URL).toString()

describe.skipIf(!ADMIN_URL || !APP_URL || isEmbedded(APP_URL))('the schema step', () => {
  let policies = 0

  beforeAll(async () => {
    const server = new URL('/postgres', ADMIN_URL).toString()
    await query(server, `drop database if exists ${SCRATCH} with (force)`)
    await query(server, `create database ${SCRATCH} owner ic_migrate`)
    await query(admin(), readFileSync(`${REPO}docker/db/roles.sql`, 'utf8'))
    const first = await step()
    expect(first.code, first.out).toBe(0)
    policies = (await query<{ n: number }>(admin(), POLICIES))[0]!.n
    expect(policies, 'the first run made no policy, so nothing here can see one drop').toBeGreaterThan(0)
  }, 120_000)

  afterAll(async () => {
    await query(new URL('/postgres', ADMIN_URL).toString(), `drop database if exists ${SCRATCH} with (force)`)
  })

  it('run again on an unchanged store, commits nothing and never leaves a table without its policies', async () => {
    const before = await query<{ x: string }>(admin(), 'select xmin::text as x from pg_policy order by 1')
    for (let again = 0; again < 3; again++) {
      const { result, lowest } = await watchingPolicies(() => step())
      expect(result.code, result.out).toBe(0)
      expect(lowest, 'a concurrent session saw the policies gone').toBe(policies)
    }
    expect(
      await query<{ x: string }>(admin(), 'select xmin::text as x from pg_policy order by 1'),
      'an unchanged store had its policies rewritten',
    ).toEqual(before)
  }, 120_000)

  it('run beside a write holding a case table and then reaching the change feed, lets both finish', async () => {
    // The order every versioned write takes its tables in. -> `src/db/mutate.ts`
    const writer = new Client({ connectionString: scratchUrl('ic_app') })
    await writer.connect()
    try {
      await writer.query('begin')
      await writer.query('update casenotes set note = note where false')
      const running = step()
      const present = `select count(*)::int as n from pg_stat_activity where datname = $1 and usename = 'ic_migrate'`
      while ((await query<{ n: number }>(admin(), present, [SCRATCH]))[0]!.n === 0) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      await writer.query('insert into change_feed select * from change_feed where false')
      await writer.query('commit')
      const ran = await running
      expect(ran.code, ran.out).toBe(0)
    } finally {
      await writer.end()
    }
  }, 120_000)

  it('puts back a policy the database holds differently from the schema', async () => {
    const qual = `select qual from pg_policies where tablename = 'evidence' and policyname = 'case_scope'`
    const [original] = await query<{ qual: string }>(admin(), qual)
    expect(original?.qual).toContain('app.case_id')
    await query(scratchUrl('ic_migrate'), `alter policy case_scope on evidence using (true)`)
    const ran = await step()
    expect(ran.code, ran.out).toBe(0)
    expect(await query<{ qual: string }>(admin(), qual)).toEqual([original])
  }, 60_000)

  it('leaves the application identity holding exactly what it held', async () => {
    const privileges = `select table_name || ':' || privilege_type as line
      from information_schema.role_table_grants
      where grantee = 'ic_app' and table_schema = 'public' order by 1`
    const before = await query(admin(), privileges)
    expect(before.length, 'ic_app holds nothing, so this would pass however the step went').toBeGreaterThan(0)
    await query(scratchUrl('ic_migrate'), `alter policy case_scope on evidence using (true)`)
    expect((await step()).code).toBe(0)
    expect(await query(admin(), privileges)).toEqual(before)
  }, 60_000)

  describe.each([
    { terminal: false, how: 'unattended' },
    { terminal: true, how: 'from a terminal' },
  ])('a column this version does not declare, holding data, $how', ({ terminal }) => {
    beforeAll(async () => {
      await query(scratchUrl('ic_migrate'), 'alter table library add column lc_gone text')
      await query(
        admin(),
        `insert into library (kind, name, label, lc_gone) values ('templates', 'lc-${String(terminal)}', 'kept', 'still here')`,
      )
    })

    afterAll(async () => {
      await query(admin(), `delete from library where name = 'lc-${String(terminal)}'`)
      await query(scratchUrl('ic_migrate'), 'alter table library drop column if exists lc_gone')
    })

    it('is refused, named, and kept with every policy', async () => {
      const { result, lowest } = await watchingPolicies(() => step(terminal))
      expect(result.code, result.out).toBe(2)
      expect(result.out).toMatch(/library.*lc_gone/)
      expect(lowest, 'the refused run left tables without policies meanwhile').toBe(policies)
      expect(await query(admin(), `select lc_gone from library where name = 'lc-${String(terminal)}'`)).toEqual([
        { lc_gone: 'still here' },
      ])
      expect((await query<{ n: number }>(admin(), POLICIES))[0]!.n).toBe(policies)
    }, 60_000)
  })

  it('refuses to drop a table this version does not declare, holding data', async () => {
    await query(scratchUrl('ic_migrate'), 'create table lc_orphan (id int primary key, v text)')
    await query(scratchUrl('ic_migrate'), `insert into lc_orphan values (1, 'kept')`)
    try {
      const ran = await step()
      expect(ran.code, ran.out).toBe(2)
      expect(ran.out).toContain('lc_orphan')
      expect(await query(admin(), 'select v from lc_orphan')).toEqual([{ v: 'kept' }])
    } finally {
      await query(scratchUrl('ic_migrate'), 'drop table if exists lc_orphan')
    }
  }, 60_000)

  it('refuses to convert a column stored as another type', async () => {
    await query(scratchUrl('ic_migrate'), 'alter table library alter column position type bigint')
    try {
      const ran = await step()
      expect(ran.code, ran.out).toBe(2)
      expect(ran.out).toMatch(/library.*position/)
      expect(
        await query(admin(), `select data_type from information_schema.columns where table_name = 'library' and column_name = 'position'`),
      ).toEqual([{ data_type: 'bigint' }])
    } finally {
      await query(scratchUrl('ic_migrate'), 'alter table library alter column position type integer')
    }
  }, 60_000)
})
