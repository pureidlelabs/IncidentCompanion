/**
 * A case. **Deliberately thin**: it holds what the picker needs, and each
 * entity is its own table so writes are per row.
 */
import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { rowVersioning } from './columns.js'
import { customers } from './customer.js'

/**
 * Open and closed only.
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
     */
    customer: text('customer'),

    /**
     * The organisation the case is for.
     */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),

    title: text('title').notNull(),
    status: caseStatus('status').notNull().default('open'),
    summary: text('summary'),

    /**
     * **The incident's clock, not the row's.**
     */
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Null while open, **and that is distinct from a closed case with no recorded
     * time**.
     */
    closedAt: timestamp('closed_at', { withTimezone: true }),

    /**
     * **A demo is reset, not protected.**
     */
    isDemo: boolean('is_demo').notNull().default(false),

    // --- what the incident was ------------------------------------------------
    // Read by every screen and by the report's narrative. The regulatory record
    // is its own table: it is read by the compliance lens and nothing else, and
    // forty columns nobody is looking at should not ride on a case header.

    analyst: text('analyst').notNull().default(''),

    /**
     * **Nullable, because not-yet-answered is a real state.**
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
