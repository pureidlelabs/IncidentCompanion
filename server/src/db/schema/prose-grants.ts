/**
 * What the prose role may touch, column by column: the accepted record's words
 * and who last wrote them, the keys its save filters and answers on, and a
 * change-feed row and an audit line. The row each may reach is the policies'
 * business. -> `scoped.ts`
 *
 * Applied by `server/scripts/apply-schema.mts` after the tables, in the same
 * transaction; revoked first, so a column taken out of this list loses its
 * grant on the next application.
 */
import { PROSE_ROLE } from './scoped.js'

export const proseGrants: readonly string[] = [
  `revoke all on all tables in schema public from ${PROSE_ROLE}`,
  `revoke all on all sequences in schema public from ${PROSE_ROLE}`,
  `grant select (id, case_id, version), update (document, updated_by, updated_at) on reports to ${PROSE_ROLE}`,
  `grant select (id, case_id, version), update (document, note, updated_by, updated_at) on casenotes to ${PROSE_ROLE}`,
  `grant select (id, report_id, case_id) on report_blocks to ${PROSE_ROLE}`,
  `grant select (id) on "user" to ${PROSE_ROLE}`,
  `grant insert on change_feed, install_activity to ${PROSE_ROLE}`,
  `grant usage on sequence change_feed_seq_seq, install_activity_seq_seq to ${PROSE_ROLE}`,
]
