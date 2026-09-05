/**
 * Groups, the customers they hold, and who is in them at what level.
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
 */
export const LEVELS = ['read', 'write', 'delete'] as const

/**
 * One analyst's membership of one group, at one level.
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
