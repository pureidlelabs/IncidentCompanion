/**
 * Migration generation. **The only migration tool in this project.**
 *
 * Better Auth's own `migrate` command exists for its Kysely path and does
 * nothing here - its four tables are declared in `src/db/schema/auth.ts` and
 * travel in these migrations like any other. Running both would produce two
 * sources of truth for the same tables.
 *
 * The URL is read at generate time only. `generate` diffs the schema against
 * the migration history on disk and never opens a connection; `migrate` and
 * `push` do.
 */
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
