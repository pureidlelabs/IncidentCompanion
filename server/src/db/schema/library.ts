/**
 * The library: what a case, a report or a written section can start from.
 *
 * One table for every library, keyed by `kind` - they differ in what their
 * payload holds and in nothing else, and the routes, the panes and the rules
 * are shared.
 *
 * Install-level, not case-owned: no `caseId` and no row-level security policy,
 * because there is no case to scope a row to.
 */
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const library = pgTable(
  'library',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Which library this row is in, spelled as the URL spells it:
     * `templates`, `report-layouts`, `report-snippets`.
     *
     * Text rather than a pg enum - the set is the route's vocabulary, and
     * `LIBRARY_KINDS` in `library/kinds.ts` is what refuses an unknown one at
     * the door. A new library is a row's value here and would be a migration
     * there.
     */
    kind: text('kind').notNull(),

    /**
     * The stable identifier inside its kind - the TOML stem Python used.
     *
     * **Not the label.** It is what a case create names to seed from, and what
     * a URL carries, so renaming the label must not break either.
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
     * Switched off rather than removed, and only a built-in can be. A disabled
     * entry stays visible on its library pane and stops being *offered* - not
     * in the report's snippet menu, not a case's start-from option.
     */
    disabled: boolean('disabled').notNull().default(false),

    /**
     * Everything the kind holds, which is the only thing that differs between
     * them - a template's checklist, a snippet's text per language. Unchecked
     * here; the kind's own Zod schema validates it at the door.
     */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),

    position: integer('position').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('library_kind_idx').on(t.kind),
    /**
     * **A name is unique within its kind, not across the table.** Two
     * libraries may both hold `ransomware` and mean different things; one
     * library holding it twice is what a create has to refuse, and this is
     * what refuses it rather than a read-then-write in the service.
     */
    uniqueIndex('library_kind_name_idx').on(t.kind, t.name),
  ],
)
