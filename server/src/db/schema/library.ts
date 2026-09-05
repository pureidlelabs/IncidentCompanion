/**
 * The library: what a case, a report or a written section can start from.
 */
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const library = pgTable(
  'library',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Which library this row is in, spelled as the URL spells it:
     * `templates`, `report-layouts`, `report-snippets`.
     */
    kind: text('kind').notNull(),

    /**
     * The stable identifier inside its kind - the TOML stem Python used.
     */
    name: text('name').notNull(),

    label: text('label').notNull(),
    description: text('description').notNull().default(''),

    /**
     * Shipped with the app and seeded from code on boot. A built-in may be
     * duplicated, and never edited or deleted.
     */
    builtin: boolean('builtin').notNull().default(false),

    /**
     * Switched off rather than removed, and only a built-in can be.
     */
    disabled: boolean('disabled').notNull().default(false),

    /**
     * Everything the kind holds, which is the only thing that differs between them
     * - a template's checklist, a snippet's text per language.
     */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),

    /** Where it sits in its pane, so a list has an order somebody chose. */
    position: integer('position').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('library_kind_idx').on(t.kind),
    /**
     * **A name is unique within its kind, not across the table.**
     */
    uniqueIndex('library_kind_name_idx').on(t.kind, t.name),
  ],
)
