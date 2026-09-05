/**
 * What a report prints its furniture in, per install.
 *
 * **English is not in here.** It is the fallback every other pack falls
 * through key by key, and the key universe coverage is measured against, so it
 * stays compiled in.
 */
import { boolean, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const reportLanguage = pgTable(
  'report_language',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The language tag the report is requested with - `nl`, `de`, `fr-BE`.
     */
    code: text('code').notNull(),

    /**
     * What the picker shows, in the language's own words.
     */
    label: text('label').notNull(),

    /** Key to string. Sparse on purpose - what is absent falls back to English. */
    strings: jsonb('strings').notNull().$type<Record<string, string>>(),

    /**
     * How much of English this pack carried when it was written, 0 to 1.
     */
    coverage: real('coverage').notNull(),

    /**
     * Shipped with the app, and upserted on every boot.
     */
    builtin: boolean('builtin').notNull().default(false),

    uploadedBy: text('uploaded_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('report_language_code').on(table.code)],
)
