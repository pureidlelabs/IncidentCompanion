/**
 * Groups, the customers they hold, and who is in them at what level.
 *
 * **Reach is not granted to an analyst over a customer.** It is granted to an
 * analyst over a *group*, and the group holds customers - which is what makes
 * the third clause of `A group is built for a sector` true: a customer added
 * to the group later is reached without anybody touching the analyst.
 *
 * The two join tables are separate because the two edges are granted by
 * different people at different times: who is in the sector is a fact about
 * the business, and who may see the sector is a fact about the person.
 */
import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'

import { rowVersioning } from './columns.js'
import { customers } from './customer.js'
import { user } from './auth.js'

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ...rowVersioning,
})

/**
 * Which customers a group holds.
 *
 * `cascade` on both sides: a group that is gone holds nothing, and a customer
 * that is gone is in no group. Neither deletion is a way to lose a case -- a
 * customer with cases cannot be removed at all.
 * -> `customers/customers.service.ts`
 */
export const groupCustomers = pgTable(
  'group_customers',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.customerId] })],
)

/**
 * What an analyst may do to the cases of every customer in a group.
 *
 * The three the specification names, and no more. **`write` includes removing
 * an entry, an entity, a piece of evidence or a report section** -- everything
 * inside a case is the analyst's working material, and taking a wrong entry
 * out is ordinary work. `delete` is about the case as a whole and nothing
 * smaller.
 */
export const LEVELS = ['read', 'write', 'delete'] as const

/**
 * One analyst's membership of one group, at one level.
 *
 * The primary key is the pair, so a second grant to the same group is a change
 * of level rather than a second row -- *most permissive applies* is about two
 * different groups, never about one membership recorded twice.
 */
export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    level: text('level', { enum: LEVELS }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
)
