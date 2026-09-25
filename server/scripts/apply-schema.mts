/**
 * Brings the store to the shape `src/db/schema` declares, in one transaction.
 *
 *     node --import tsx scripts/apply-schema.mts
 *
 * Reads `DATABASE_URL`, which must name the role owning the tables. Exits 0
 * having applied the difference or found none (and then committing nothing),
 * 2 having refused a change that would discard or convert stored data or that
 * names a stored entity differently, and 1 when a statement failed. Every exit
 * but 0 leaves the store as it was.
 */
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { generateDrizzleJson, pushSchema } from 'drizzle-kit/api-postgres'
import { is } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { PgTable } from 'drizzle-orm/pg-core'
import pg from 'pg'

import * as declared from '../src/db/schema/index.js'
import { CASE_WRITABLE } from '../src/domain/case.js'
import { grants } from '../src/db/schema/grants.js'
import { storeGuards } from '../src/db/schema/store-guards.js'

// Loaded as CommonJS under tsx, where the exports sit on `default`.
const schema: Record<string, unknown> =
  (declared as { default?: Record<string, unknown> }).default ?? declared

export type Outcome =
  | { kind: 'unchanged' }
  | { kind: 'applied'; statements: number }
  | { kind: 'refused'; statements: string[] }

/** Held for the transaction, so two preparations never interleave. */
const LOCK = 7_340_111

/** How long a busy store is waited for before the step gives up, changing nothing. */
const PATIENCE_MS = 120_000

/**
 * Opens the transaction holding every table, retrying while any is in use.
 * Throws, having rolled back, once the store has been busy for `PATIENCE_MS`.
 */
async function holdEveryTable(client: pg.Client): Promise<void> {
  const deadline = Date.now() + PATIENCE_MS
  for (;;) {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock($1)', [LOCK])
    const { rows } = await client.query<{ tables: string | null }>(
      `select string_agg(format('%I.%I', schemaname, tablename), ', ') as tables from pg_tables where schemaname = 'public'`,
    )
    try {
      // `nowait`: waiting on one table while holding another deadlocks a write
      // that holds the second and reaches for the first.
      if (rows[0]?.tables) await client.query(`lock table ${rows[0].tables} in access exclusive mode nowait`)
      return
    } catch (error) {
      await client.query('rollback')
      if ((error as { code?: string }).code !== '55P03' || Date.now() > deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
}

/**
 * Statements that discard or convert what is stored. Drizzle's own hints do
 * not flag them, so the classification is made here.
 */
const LOSSY = [
  /^DROP TABLE\b/i,
  /^DROP SCHEMA\b/i,
  /^DROP TYPE\b/i,
  /^DROP SEQUENCE\b/i,
  /^TRUNCATE\b/i,
  /^DELETE\b/i,
  /\bDROP COLUMN\b/i,
  /\bSET DATA TYPE\b/i,
]

/**
 * What the policies, the store's own functions and who may call them, triggers,
 * each table's, column's and sequence's grants, and row security are. Drizzle plans the rest, so a
 * run whose plan is only the policies it was made to recreate changed nothing
 * when this is equal.
 */
const SHAPE = `
  select json_build_object(
    'policies', (select coalesce(json_agg(p order by p.tablename, p.policyname), '[]')
                   from (select tablename, policyname, cmd, roles::text, permissive, qual, with_check
                           from pg_policies where schemaname = 'public') p),
    'functions', (select coalesce(json_agg(json_build_object('def', pg_get_functiondef(f.oid), 'acl', f.proacl::text)
                                      order by f.oid::regprocedure::text), '[]')
                    from pg_proc f join pg_namespace n on n.oid = f.pronamespace
                   where n.nspname = 'public' and f.prokind in ('f', 'p')),
    'triggers', (select coalesce(json_agg(pg_get_triggerdef(t.oid) order by c.relname, t.tgname), '[]')
                   from pg_trigger t join pg_class c on c.oid = t.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and not t.tgisinternal),
    'tables', (select coalesce(json_agg(json_build_object('name', c.relname, 'rls', c.relrowsecurity,
                                 'force', c.relforcerowsecurity, 'acl', c.relacl::text) order by c.relname), '[]')
                 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'p')),
    'columns', (select coalesce(json_agg(json_build_object('name', c.relname || '.' || a.attname, 'acl', a.attacl::text)
                                  order by c.relname, a.attname), '[]')
                  from pg_attribute a join pg_class c on c.oid = a.attrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and a.attacl is not null),
    'sequences', (select coalesce(json_agg(json_build_object('name', c.relname, 'acl', c.relacl::text)
                                    order by c.relname), '[]')
                    from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind = 'S')
  )::text as shape`

/** Every table, column, index, constraint and enum the store holds, by the planner's kind. */
const STORED = `
  select 'table' as kind, c.relname as name from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  union all
  select 'column', c.relname || '.' || a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
  union all
  select 'index', c.relname || '.' || i.relname from pg_index x
    join pg_class i on i.oid = x.indexrelid join pg_class c on c.oid = x.indrelid
   where c.relnamespace = 'public'::regnamespace
     and not exists (select from pg_constraint k where k.conindid = x.indexrelid and k.contype in ('p', 'u', 'x'))
  union all
  select case k.contype when 'p' then 'primary_key' when 'u' then 'unique' when 'c' then 'check' else 'foreign key' end,
         c.relname || '.' || k.conname
    from pg_constraint k join pg_class c on c.oid = k.conrelid
   where c.relnamespace = 'public'::regnamespace and k.contype in ('p', 'u', 'c', 'f')
  union all
  select 'enum', t.typname from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype = 'e'`

/** The planner's kinds, as its snapshot of the declaration names them. */
const DECLARED: Record<string, string> = {
  table: 'tables',
  column: 'columns',
  index: 'indexes',
  primary_key: 'pks',
  unique: 'uniques',
  check: 'checks',
  'foreign key': 'fks',
  enum: 'enums',
}

/** What of `kind` the store holds and the declaration lacks, and the reverse, one line each. */
async function unmatched(client: pg.Client, kind: string): Promise<string[]> {
  const { rows } = await client.query<{ kind: string; name: string }>(STORED)
  const stored = rows.filter((row) => row.kind === kind).map((row) => row.name)
  const { ddl } = await generateDrizzleJson(schema)
  const declared = (ddl as { entityType: string; table?: string; name: string }[])
    .filter((entity) => entity.entityType === DECLARED[kind])
    .map((entity) => (entity.table ? `${entity.table}.${entity.name}` : entity.name))
  const lines = [
    ...stored.filter((name) => !declared.includes(name)).map((name) => `${kind} ${name}: stored, and not in this version`),
    ...declared.filter((name) => !stored.includes(name)).map((name) => `${kind} ${name}: in this version, and not stored`),
  ]
  return lines.length > 0 ? lines : [`a ${kind} is stored that this version does not have, beside one it adds`]
}

async function shape(client: pg.Client): Promise<string> {
  const { rows } = await client.query<{ shape: string }>(SHAPE)
  return rows[0]!.shape
}

/** Applies the declared shape to the database at `url`. */
export async function applySchema(url: string): Promise<Outcome> {
  // An empty declaration plans every table's removal, or nothing at all.
  if (!Object.values(schema).some((value) => is(value, PgTable))) {
    throw new Error('src/db/schema declares no table, so there is nothing to apply')
  }
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await holdEveryTable(client)
    const before = await shape(client)

    // Drizzle creates a policy a table lacks and never alters one it has, so
    // every policy is dropped first -- inside this transaction, so no reader
    // ever meets a table without its policies.
    const { rows: policies } = await client.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies where schemaname = 'public'`,
    )
    for (const { tablename, policyname } of policies) {
      await client.query(
        `drop policy ${client.escapeIdentifier(policyname)} on public.${client.escapeIdentifier(tablename)}`,
      )
    }
    // The policies the plan creates call these, so they exist before it runs.
    await client.query(await readFile(new URL('../src/db/reach.sql', import.meta.url), 'utf8'))

    let planned: Awaited<ReturnType<typeof pushSchema>>
    try {
      planned = await pushSchema(schema, drizzle({ client }))
    } catch (error) {
      // Thrown, planning nothing, when one kind has entities on both sides:
      // the planner cannot tell a rename from a removal and an addition.
      const kind = /resolver\((.+)\) was called without a HintsHandler/.exec(String(error))?.[1]
      if (!kind) throw error
      const statements = await unmatched(client, kind)
      await client.query('rollback')
      return { kind: 'refused', statements }
    }
    const { sqlStatements, hints } = planned
    const refused = [
      ...sqlStatements.filter((statement) => LOSSY.some((lossy) => lossy.test(statement.trim()))),
      ...hints.map(({ hint, statement }) => statement ?? hint),
    ]
    if (refused.length > 0) {
      await client.query('rollback')
      return { kind: 'refused', statements: refused }
    }

    const granted = grants(
      CASE_WRITABLE,
      Object.values(schema).filter((value): value is PgTable => is(value, PgTable)),
    )
    for (const statement of [...sqlStatements, ...storeGuards, ...granted]) await client.query(statement)

    const onlyPolicies = sqlStatements.every((statement) => /^CREATE POLICY\b/i.test(statement.trim()))
    if (onlyPolicies && (await shape(client)) === before) {
      await client.query('rollback')
      return { kind: 'unchanged' }
    }
    await client.query('commit')
    return { kind: 'applied', statements: sqlStatements.length + storeGuards.length + granted.length }
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set; it names the role that owns the tables.')
    return 1
  }
  try {
    const outcome = await applySchema(url)
    if (outcome.kind === 'refused') {
      console.error('Refused: this version would discard or convert what the store holds, or names it differently.')
      for (const statement of outcome.statements) console.error(`  ${statement}`)
      console.error('Nothing was changed.')
      return 2
    }
    console.log(outcome.kind === 'unchanged' ? 'Schema unchanged.' : `Schema applied: ${outcome.statements} statements.`)
    return 0
  } catch (error) {
    console.error(`The schema could not be applied, and nothing was changed: ${String(error)}`)
    return 1
  }
}

// Node runs a linked script from its real path, so the path it was named by is resolved too.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main()
}
