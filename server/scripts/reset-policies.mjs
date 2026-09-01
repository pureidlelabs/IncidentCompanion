/**
 * Drops every row-level-security policy in `public`, so the push that follows
 * recreates all of them from the schema.
 *
 * `drizzle-kit push` creates a policy a table does not have and never alters
 * one it does, answering a changed expression with *"No changes detected"*.
 * Absent is the only state it acts on.
 *
 * Reads `DATABASE_URL`, which has to name the role owning the tables.
 */
import { Client } from 'pg'

const client = new Client({ connectionString: process.env.DATABASE_URL ?? '' })
await client.connect()
// A table left with no policy is default-deny rather than open: `ENABLE ROW
// LEVEL SECURITY` stands on its own, and no policy matches no row.
await client.query(`
  do $$
  declare policy record;
  begin
    for policy in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
    loop
      execute format('drop policy %I on %I.%I', policy.policyname, policy.schemaname, policy.tablename);
    end loop;
  end $$;
`)
await client.end()
