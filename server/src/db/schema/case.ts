/**
 * A case. **Deliberately thin**: it holds what the picker needs, and each
 * entity is its own table so writes are per row.
 *
 * **The id is generated and never shown**, because a human-supplied primary
 * key lets two analysts race for the same one and cannot be corrected after a
 * typo. What analysts quote is `reference`, the customer's own ITSM ticket -
 * nullable and not unique on purpose, since a case often exists before the
 * ticket and two customers' numbers can collide.
 */
import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { rowVersioning } from './columns.js'
import { customers } from './customer.js'

/**
 * Open and closed only. **`archived` is not a status**: archiving is a storage
 * decision, and a closed case still on disk is not a third state -
 * conflating them is how a filter for closed work starts hiding it.
 */
export const caseStatus = pgEnum('case_status', ['open', 'closed'])

export const cases = pgTable(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The customer's ITSM ticket. Not unique, not required, editable. */
    reference: text('reference'),

    /**
     * Who the incident is for, as text.
     *
     * **Being retired in favour of `customerId` beside it.** This was free
     * text because a customer directory is its own feature and inventing one
     * here would have made every case creation depend on it. The directory
     * now exists, so new cases carry the reference; this column stays until
     * what reads it -- the picker, the exports, the report -- reads the
     * reference instead, and is removed in the branch that moves them.
     */
    customer: text('customer'),

    /**
     * The organisation the case is for.
     *
     * **`restrict`, because a customer cannot be removed out from under its
     * cases** -- which `openspec/specs/customers/spec.md` requires by name.
     * Cascading would delete the cases and `set null` would quietly orphan
     * them; refusing is the answer that leaves an administrator something to
     * do about it.
     *
     * Nullable in the column, never in a case this application opens: the
     * insert reads the default, and boot claims any row that carries none.
     */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),

    title: text('title').notNull(),
    status: caseStatus('status').notNull().default('open'),
    summary: text('summary'),

    /**
     * **The incident's clock, not the row's.** `createdAt` is when someone
     * opened the case in this app; `openedAt` is when the incident began, and
     * they differ whenever a case is raised after the fact - which is most of
     * them. Reporting reads this one.
     */
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Null while open, **and that is distinct from a closed case with no
     * recorded time**. Collapsing the two loses the only evidence that a
     * closure time was never captured.
     */
    closedAt: timestamp('closed_at', { withTimezone: true }),

    /**
     * **A demo is reset, not protected.** Writes to it work exactly as they do
     * anywhere else - which is the point, since presence, a refused save and
     * the shared prose are what a demo exists to show - and a reset puts it
     * back. Storing demos apart from real cases was the alternative and would
     * fork every read path in the app behind a branch nothing exercises.
     */
    isDemo: boolean('is_demo').notNull().default(false),

    // --- what the incident was ------------------------------------------------
    // Read by every screen and by the report's narrative. The regulatory record
    // is its own table: it is read by the compliance lens and nothing else, and
    // forty columns nobody is looking at should not ride on a case header.

    analyst: text('analyst').notNull().default(''),

    /**
     * **Nullable, because not-yet-answered is a real state.** Python defaults
     * this to the string `unknown`, which is a genuine VERIS value - so it read
     * as an answer and printed as one on a customer report.
     */
    incidentClass: text('incident_class'),
    rsitClass: text('rsit_class'),
    rsitType: text('rsit_type').notNull().default(''),

    /** One scale, shared with a timeline entry. -> domain/vocabularies.ts */
    severity: text('severity'),

    detectionSource: text('detection_source').notNull().default(''),
    initialAccessVector: text('initial_access_vector').notNull().default(''),

    /** The incident's own clock. What a regulator's timeline is built from. */
    detectedAt: timestamp('detected_at', { withTimezone: true }),
    containedAt: timestamp('contained_at', { withTimezone: true }),
    eradicatedAt: timestamp('eradicated_at', { withTimezone: true }),
    recoveredAt: timestamp('recovered_at', { withTimezone: true }),

    /** The contributing failure, in words - not the interval between two of the above. */
    detectionGap: text('detection_gap').notNull().default(''),

    ...rowVersioning,
  },
  (table) => [
    // The picker's list, and the only query with an order that matters.
    index('cases_updated_at_idx').on(table.updatedAt),
  ],
)

export type CaseRow = typeof cases.$inferSelect
