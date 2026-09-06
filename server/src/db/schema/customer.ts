/**
 * The organisation an incident happened to.
 *
 * **Identified by a generated id and never by its name**, so renaming an
 * organisation breaks nothing that refers to it -- which is the whole of the
 * first requirement in `openspec/specs/customers/spec.md`.
 *
 * **What lives here is the organisation's, never the incident's.** Which
 * regimes apply, where it is established, who its authority is, how large it
 * is: answered once rather than retyped into every case. Whether personal data
 * was involved, how long service was down, what an incident cost and when
 * somebody was notified are the case's and stay in `case_compliance`.
 *
 * The columns mirror that table's on purpose -- a case takes a *copy* of these
 * rather than reading them live, so a report written months ago still says
 * what was true when it was written. The copy is taken once, when the
 * compliance row is raised. -> `compliance/compliance.service.ts`
 */
import { bigint, boolean, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { rowVersioning } from './columns.js'

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    name: text('name').notNull(),

    /**
     * The one standing for an incident whose origin is not yet known.
     *
     * **A flag rather than a well-known id**, so the row can be renamed and
     * still be the default, and so the constraint below can say "exactly one"
     * in the database rather than in a service somebody can bypass. The
     * specification requires the install to always hold one, that it not be
     * deletable, and that it not be editable into an ordinary customer.
     */
    isDefault: boolean('is_default').notNull().default(false),

    /**
     * Which regimes are asked about at all for this organisation. Absent means
     * nobody has said yet, which is not the same as none applying -- the
     * distinction `compliance` calls the third answer.
     */
    regimes: text('regimes').array(),

    homeMemberState: text('home_member_state'),
    outsideEuReach: boolean('outside_eu_reach').notNull().default(false),
    outsideEuCountries: text('outside_eu_countries').notNull().default(''),
    competentAuthority: text('competent_authority').notNull().default(''),
    dpoContact: text('dpo_contact').notNull().default(''),

    usersTotalCount: integer('users_total_count'),
    /**
     * **`bigint`, because `int4` stops at EUR 2.1bn** -- and the regimes that
     * ask for this figure ask it of the entities above that line. Postgres
     * refuses the write rather than truncating, so the column would simply
     * decline the answer for the organisations the question is for.
     *
     * `mode: 'number'` keeps it a JavaScript number: the ceiling that matters
     * is the column's, and 2^53 is past any turnover in euros.
     */
    annualTurnoverEur: bigint('annual_turnover_eur', { mode: 'number' }),

    doraCriticalFunctions: text('dora_critical_functions'),
    doraSupervisedServices: text('dora_supervised_services'),

    ...rowVersioning,
  },
  (t) => [
    /**
     * **Exactly one default, enforced where it cannot be talked round.** A
     * partial unique index over the flag admits any number of ordinary
     * customers and exactly one default; a service-level check would be one
     * forgotten call site away from two, and the install would then have a
     * default that half the code disagreed about.
     */
    uniqueIndex('customers_one_default').on(t.isDefault).where(sql`${t.isDefault}`),
  ],
)
