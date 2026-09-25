/**
 * Every table and sequence privilege the serving, seeding and prose roles
 * hold. The row each may reach is the policies' business. -> `scoped.ts`
 *
 * Applied by `server/scripts/apply-schema.mts` after the tables, in the same
 * transaction. Everything is revoked first, so this list is the whole of what
 * each role holds, and nothing else that grants on a table survives the next
 * application.
 */
import { getTableColumns } from 'drizzle-orm'

import { cases } from './case.js'
import { PROSE_ROLE } from './scoped.js'

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

/** The statements, where `caseWritable` is what a case PATCH may set, by field. */
export const grants = (caseWritable: readonly string[]): readonly string[] => [
  `revoke all on all tables in schema public from ic_app, ic_seed, ${PROSE_ROLE}`,
  `revoke all on all sequences in schema public from ic_app, ic_seed, ${PROSE_ROLE}`,
  // No TRUNCATE: it is a table privilege row-level security never sees.
  `grant select, insert, update, delete on all tables in schema public to ic_app, ic_seed`,
  `grant usage, select on all sequences in schema public to ic_app, ic_seed`,
  // An acceptance is written once and removed; nobody renames the writer it names.
  `revoke update on prose_acceptances from ic_app, ic_seed`,
  // Who changed a case is added to and never rewritten; the case's delete takes it by cascade.
  `revoke update, delete on change_feed from ic_app`,
  // A case changes customer only through the store's move, which holds the move's rules.
  `revoke update on cases from ic_app`,
  `grant update (${caseColumnsWritten(caseWritable)}) on cases to ic_app`,
  `grant select (id, case_id, version), update (document, updated_by, updated_at) on reports to ${PROSE_ROLE}`,
  `grant select (id, case_id, version), update (document, note, updated_by, updated_at) on casenotes to ${PROSE_ROLE}`,
  `grant select (id, report_id, case_id) on report_blocks to ${PROSE_ROLE}`,
  `grant select (id) on "user" to ${PROSE_ROLE}`,
  `grant select (id, case_id, record_id, writer_id, accepted_at), update (accepted_at), delete on prose_acceptances to ${PROSE_ROLE}`,
  `grant insert on change_feed, install_activity to ${PROSE_ROLE}`,
  `grant usage on sequence change_feed_seq_seq, install_activity_seq_seq to ${PROSE_ROLE}`,
]
