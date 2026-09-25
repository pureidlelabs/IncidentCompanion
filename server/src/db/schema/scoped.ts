/**
 * The policies that keep a case's rows from anybody who does not reach it.
 *
 * A row is served only to a transaction that names both its case and who is
 * asking, and only where `ic_reach` says the asker holds the level the command
 * needs: read to see a row, write to add, change or remove one. Unset is
 * default-deny: with no case or no principal set, every table answers empty and
 * every write is refused. -> `db/reach.sql`, `db/scope.ts`
 *
 * **One policy per command**, because a single `for all` policy applies its
 * `using` to a delete, and reading is not enough to remove a row.
 */
import { sql, type SQL } from 'drizzle-orm'
import { pgPolicy, type PgColumn } from 'drizzle-orm/pg-core'

import { LEVELS } from './groups.js'

const currentCase = sql`nullif(current_setting('app.case_id', true), '')::uuid`
const principal = sql`nullif(current_setting('app.principal', true), '')`

/** The levels at or above `needed`, as a SQL list. Ordered by `LEVELS`. */
const atLeast = (needed: (typeof LEVELS)[number]): SQL =>
  sql.raw(
    LEVELS.slice(LEVELS.indexOf(needed))
      .map((level) => `'${level}'`)
      .join(', '),
  )

/** The case in scope is `caseId`, and the principal holds `needed` over it. */
const inScope = (caseId: PgColumn, needed: (typeof LEVELS)[number]): SQL =>
  sql`${caseId} = ${currentCase} and (select r.present and r.level in (${atLeast(needed)}) from ic_reach(${principal}, ${currentCase}) r)`

/**
 * **The seeder is exempt per table rather than with `BYPASSRLS`**, so the
 * exemption is visible here and does not extend to a table added for reasons
 * nobody revisited. It writes across every case, and generating demos deletes
 * all of them -- a privilege the process serving requests must not hold.
 */
const seeder = (): ReturnType<typeof pgPolicy> =>
  pgPolicy('seeder_writes_across_cases', { to: 'ic_seed', using: sql`true`, withCheck: sql`true` })

/** The role accepted prose is stored as. -> `openspec/specs/live/design.md` */
export const PROSE_ROLE = 'ic_prose'

/** How long an acceptance authorises storing what it accepted, as the store answers it. -> `db/reach.sql` */
export const ACCEPTANCE_LASTS = sql`public.ic_acceptance_lasts()`

/** The record whose accepted prose is being stored, as text, or null. */
const acceptedRecord = sql`nullif(current_setting('app.prose_record', true), '')`

/**
 * `who` names a writer whose words were accepted for `record`, or nobody where
 * one of them has no account left.
 */
function anAcceptedWriter(who: PgColumn | SQL, record: PgColumn | SQL): SQL {
  const current = sql`a.record_id::text = ${record}::text and a.accepted_at > now() - ${ACCEPTANCE_LASTS}`
  return sql`(${who} in (select a.writer_id from prose_acceptances a where ${current})
    or (${who} is null and exists (
      select 1 from prose_acceptances a
       where ${current}
         and not exists (select 1 from "user" u where u.id = a.writer_id))))`
}

/**
 * Spread into a table the prose role touches: it reaches only rows of the
 * accepted record, in the case in scope, and only for `commands`. Where the
 * row names a writer in `writer`, it must be one whose words were accepted.
 *
 * The first policy is restrictive, so a permissive policy granted to everybody
 * cannot widen what the role reaches.
 */
export function proseKept(
  caseId: PgColumn,
  record: PgColumn,
  commands: readonly ('select' | 'insert' | 'update' | 'delete')[],
  writer?: PgColumn,
): ReturnType<typeof pgPolicy>[] {
  const accepted = sql`${caseId} = ${currentCase} and ${record}::text = ${acceptedRecord}`
  const written = writer ? sql`${accepted} and ${anAcceptedWriter(writer, record)}` : accepted
  return [
    pgPolicy('prose_reaches_only_the_accepted_record', {
      as: 'restrictive',
      to: PROSE_ROLE,
      using: accepted,
      withCheck: written,
    }),
    ...commands.map((command) =>
      pgPolicy(`prose_${command}s_the_accepted_record`, {
        for: command,
        to: PROSE_ROLE,
        ...(command === 'insert' ? {} : { using: accepted }),
        ...(command === 'select' || command === 'delete' ? {} : { withCheck: written }),
      }),
    ),
  ]
}

/**
 * The same, for the audit, whose rows name their case and record in `detail`
 * rather than in a column.
 */
export function proseAudited(detail: PgColumn, actor: PgColumn): ReturnType<typeof pgPolicy> {
  const record = sql`${detail}->>'record'`
  return pgPolicy('prose_audits_only_the_accepted_record', {
    as: 'restrictive',
    for: 'insert',
    to: PROSE_ROLE,
    withCheck: sql`${detail}->>'case' = ${currentCase}::text and ${record} = ${acceptedRecord}
      and ${anAcceptedWriter(actor, record)}`,
  })
}

/**
 * Spread into the config of a table whose rows each belong to one case.
 *
 * `raisedBy` is the level that may add a row: `read` for a record the first
 * reader raises from defaults, which is a read and not an edit.
 */
export function caseScoped(
  caseId: PgColumn,
  raisedBy: (typeof LEVELS)[number] = 'write',
): ReturnType<typeof pgPolicy>[] {
  return [
    pgPolicy('case_reads', { for: 'select', using: inScope(caseId, 'read') }),
    pgPolicy('case_inserts', { for: 'insert', withCheck: inScope(caseId, raisedBy) }),
    pgPolicy('case_updates', {
      for: 'update',
      using: inScope(caseId, 'write'),
      withCheck: inScope(caseId, 'write'),
    }),
    pgPolicy('case_deletes', { for: 'delete', using: inScope(caseId, 'write') }),
    seeder(),
  ]
}

/**
 * The same, for a record of the case: read and added to, and never changed or
 * removed by the application. It goes with its case by its foreign key.
 */
export function caseRecorded(caseId: PgColumn): ReturnType<typeof pgPolicy>[] {
  return [
    pgPolicy('case_reads', { for: 'select', using: inScope(caseId, 'read') }),
    pgPolicy('case_inserts', { for: 'insert', withCheck: inScope(caseId, 'write') }),
    seeder(),
  ]
}

/**
 * The same, for `cases` itself, which is reached through its own customer.
 *
 * Deleting a case needs `delete`. **Moving one is not an update the
 * application may make**: it holds no grant on the customer column, so only
 * the store's own acts change it. -> `prose-grants.ts`, `db/reach.sql`
 */
export function customerScoped(customerId: PgColumn): ReturnType<typeof pgPolicy>[] {
  const holds = (needed: (typeof LEVELS)[number]): SQL =>
    sql`ic_level(${principal}, ${customerId}) in (${atLeast(needed)})`
  return [
    pgPolicy('case_reads', { for: 'select', using: holds('read') }),
    pgPolicy('case_inserts', { for: 'insert', withCheck: holds('write') }),
    pgPolicy('case_updates', { for: 'update', using: holds('write'), withCheck: holds('write') }),
    pgPolicy('case_deletes', { for: 'delete', using: holds('delete') }),
    seeder(),
  ]
}

/**
 * The same, for a row that belongs to one analyst's view of one case.
 *
 * Seen and written only by that analyst, and only while they reach the case.
 * **Removing one asks only whose it is**, so a list pruned after reach was
 * withdrawn can still drop the rows it no longer shows.
 */
export function visitorScoped(userId: PgColumn, caseId: PgColumn): ReturnType<typeof pgPolicy>[] {
  const theirs = sql`${userId} = ${principal}`
  const reached = sql`${theirs} and (select r.present and r.level is not null from ic_reach(${principal}, ${caseId}) r)`
  return [
    pgPolicy('visit_reads', { for: 'select', using: reached }),
    pgPolicy('visit_inserts', { for: 'insert', withCheck: reached }),
    pgPolicy('visit_updates', { for: 'update', using: reached, withCheck: reached }),
    pgPolicy('visit_deletes', { for: 'delete', using: theirs }),
    seeder(),
  ]
}
