/**
 * Every table and sequence privilege the serving, seeding and prose roles
 * hold. The row each may reach is the policies' business. -> `scoped.ts`
 *
 * Applied by `server/scripts/apply-schema.mts` after the tables, in the same
 * transaction. Every table and sequence privilege of these roles and of PUBLIC
 * is revoked first, so this is the whole of what each holds directly, and a
 * grant made on a table out of band does not survive the next application. A
 * role membership granted out of band is an administrator's act, and this does
 * not undo it.
 */
import { getTableColumns, getTableName } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import { cases } from './case.js'
import { PROSE_ROLE } from './scoped.js'

type Privilege = 'select' | 'insert' | 'update' | 'delete'

const ALL: readonly Privilege[] = ['select', 'insert', 'update', 'delete']
const WORKED = { app: ALL, seed: ALL }

/**
 * What the serving and seeding roles may do to each table, by the table's
 * name. Never TRUNCATE: it is a table privilege row-level security never sees.
 */
const TABLES: Record<string, { app: readonly Privilege[]; seed: readonly Privilege[] }> = {
  account: WORKED,
  accounts: WORKED,
  actions: WORKED,
  case_compliance: WORKED,
  case_visits: WORKED,
  casenotes: WORKED,
  // A case's customer and make are not the app's to change; its fields are the column grant below.
  cases: { app: ['select', 'insert', 'delete'], seed: ALL },
  // Who changed a case is added to and never rewritten; the case's delete takes it by cascade.
  change_feed: { app: ['select', 'insert'], seed: ALL },
  cloud_apps: WORKED,
  conflicts: WORKED,
  customers: WORKED,
  evidence: WORKED,
  familiar_address: WORKED,
  group_customers: WORKED,
  group_members: WORKED,
  groups: WORKED,
  impact: WORKED,
  install_activity: WORKED,
  install_activity_delivery: WORKED,
  install_claim: WORKED,
  install_preferences: WORKED,
  library: WORKED,
  malware: WORKED,
  methods: WORKED,
  network_indicators: WORKED,
  preferences: WORKED,
  // An acceptance is written once and removed; nobody renames the writer it names.
  prose_acceptances: { app: ['select', 'insert', 'delete'], seed: ['select', 'insert', 'delete'] },
  report_blocks: WORKED,
  report_language: WORKED,
  reports: WORKED,
  session: WORKED,
  sign_in_lockout: WORKED,
  systems: WORKED,
  timeline: WORKED,
  user: WORKED,
  verification: WORKED,
}

/** The columns of `cases` named by `writable`, and the three a write stamps. Throws on a key the table lacks. */
function caseColumnsWritten(writable: readonly string[]): string {
  const columns = getTableColumns(cases) as Record<string, { name: string }>
  return [...writable, 'version', 'updatedAt', 'updatedBy']
    .map((key) => {
      const column = columns[key]
      if (!column) throw new Error(`a case PATCH sets ${key}, which is no column of cases`)
      return `"${column.name}"`
    })
    .join(', ')
}

/**
 * The statements, where `caseWritable` is what a case PATCH may set, by field,
 * and `declared` is every table the schema declares. Throws, so the
 * application stops before changing anything, where a declared table has no
 * entry here or an entry names no declared table.
 */
export function grants(caseWritable: readonly string[], declared: readonly PgTable[]): readonly string[] {
  const names = declared.map((table) => getTableName(table))
  const undecided = [
    ...names.filter((name) => !(name in TABLES)),
    ...Object.keys(TABLES).filter((name) => !names.includes(name)),
  ]
  if (undecided.length > 0) throw new Error(`no grant decided for: ${undecided.join(', ')}`)
  return [
    // PUBLIC as well, because every role holds what PUBLIC holds.
    `revoke all on all tables in schema public from public, ic_app, ic_seed, ${PROSE_ROLE}`,
    `revoke all on all sequences in schema public from public, ic_app, ic_seed, ${PROSE_ROLE}`,
    ...Object.entries(TABLES).flatMap(([name, { app, seed }]) => [
      `grant ${app.join(', ')} on "${name}" to ic_app`,
      `grant ${seed.join(', ')} on "${name}" to ic_seed`,
    ]),
    `grant usage, select on all sequences in schema public to ic_app, ic_seed`,
    `grant update (${caseColumnsWritten(caseWritable)}) on cases to ic_app`,
    `grant select (id, case_id, version), update (document, updated_by, updated_at) on reports to ${PROSE_ROLE}`,
    `grant select (id, case_id, version), update (document, note, updated_by, updated_at) on casenotes to ${PROSE_ROLE}`,
    `grant select (id, report_id, case_id) on report_blocks to ${PROSE_ROLE}`,
    `grant select (id) on "user" to ${PROSE_ROLE}`,
    `grant select (id, case_id, record_id, writer_id, accepted_at), update (accepted_at), delete on prose_acceptances to ${PROSE_ROLE}`,
    `grant insert on change_feed, install_activity to ${PROSE_ROLE}`,
    `grant usage on sequence change_feed_seq_seq, install_activity_seq_seq to ${PROSE_ROLE}`,
  ]
}
