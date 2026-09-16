/**
 * What a report prints its furniture in, per install.
 *
 * Not a library kind, though it is stored the same way: a pack holds what the
 * product says *around* an analyst's writing, and a layout's `headingKey`
 * resolves through one.
 *
 * **English is not in here.** It is the fallback every other pack falls
 * through key by key, and the key universe coverage is measured against, so it
 * stays compiled in.
 *
 * Install-level, so no `caseId` and no row-level policy.
 */
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const reportLanguage = pgTable(
  'report_language',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The language tag the report is requested with - `nl`, `de`, `fr-BE`.
     *
     * **Text rather than an enum**, because the whole point is that an install
     * adds one without a migration.
     */
    code: text('code').notNull(),

    /**
     * What the picker shows, in the language's own words.
     *
     * `Nederlands`, not `Dutch`: naming a language in English inside the one
     * control that exists to escape English is the assumption showing through.
     */
    label: text('label').notNull(),

    /** Key to string. Sparse on purpose - what is absent falls back to English. */
    strings: jsonb('strings').notNull().$type<Record<string, string>>(),

    /**
     * Shipped with the app, and upserted on every boot.
     *
     * A built-in may not be removed: an install that deleted Dutch would get it
     * back on the next restart, which is a control that lies.
     */
    builtin: boolean('builtin').notNull().default(false),

    uploadedBy: text('uploaded_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('report_language_code').on(table.code)],
)
