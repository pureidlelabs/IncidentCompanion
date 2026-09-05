/**
 * The organisation an incident happened to.
 */
import { bigint, boolean, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { rowVersioning } from './columns.js'

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** What an analyst calls the organisation. Editable, and not the identity. */
    name: text('name').notNull(),

    /**
     * The one standing for an incident whose origin is not yet known.
     */
    isDefault: boolean('is_default').notNull().default(false),

    /**
     * Which regimes are asked about at all for this organisation.
     */
    regimes: text('regimes').array(),

    homeMemberState: text('home_member_state'),
    outsideEuReach: boolean('outside_eu_reach').notNull().default(false),
    outsideEuCountries: text('outside_eu_countries').notNull().default(''),
    competentAuthority: text('competent_authority').notNull().default(''),
    dpoContact: text('dpo_contact').notNull().default(''),

    /** The organisation's size, against which an incident's share is read. */
    usersTotalCount: integer('users_total_count'),
    /**
     * **`bigint`, because `int4` stops at EUR 2.1bn** -- and the regimes that ask
     * for this figure ask it of the entities above that line.
     */
    annualTurnoverEur: bigint('annual_turnover_eur', { mode: 'number' }),

    doraCriticalFunctions: text('dora_critical_functions'),
    doraSupervisedServices: text('dora_supervised_services'),

    ...rowVersioning,
  },
  (t) => [
    /**
     * **Exactly one default, enforced where it cannot be talked round.**
     */
    uniqueIndex('customers_one_default').on(t.isDefault).where(sql`${t.isDefault}`),
  ],
)
