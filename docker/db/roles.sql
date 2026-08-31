-- The roles, their grants, and nothing that needs psql.
--
-- **No password is set here, and no psql variable appears here** -- the check
-- below is a grep, so this file may not even quote the syntax. The passwords
-- live in
-- `role-passwords.sql`, which is the half only psql can run; this file is plain
-- SQL every executor speaks, including the driver the test harness provisions
-- through. `docker/secrets.sh` mints the values into `.env` and `compose.yaml`
-- passes both files to psql with `-v`.
--
-- **The guarded create leaves an existing role exactly as it was**, so a role
-- made once with one password would keep it for ever. `role-passwords.sql`
-- runs unconditionally after this one for that reason, which makes `.env` the
-- authority and a rotation one `docker compose up roles` away.
-- Three roles, separated by what they may do.
--
-- Run once per database server, as a superuser. In development the dev
-- container executes it on init; anywhere else it is the first step of an
-- install, before any migration.
--
-- **The app role is the point of this file.** It may read and write rows and
-- nothing else: no DDL, no BYPASSRLS, not a superuser. A superuser walks past
-- row-level security entirely and FORCE does not apply to it -- so an app
-- connected as one makes every policy below inert while every test still
-- passes, which is a security control that reads as present and enforces
-- nothing.
--
-- Idempotent, so re-running it on an existing install is safe.

-- **Created without a password here.** `role-passwords.sql` gives them one, and
-- is a separate file because a psql variable is the one thing in here that not
-- every executor understands -- the test harness runs this through a driver
-- that has none. A role with no password cannot be authenticated as, so a run
-- of this file alone fails closed.
--
-- The block exists at all because Postgres has no `CREATE ROLE IF NOT EXISTS`.
DO $$
BEGIN
  -- Owns the schema and runs migrations. No rows pass through it, so it needs
  -- no exemption from the policies it creates.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ic_migrate') THEN
    CREATE ROLE ic_migrate LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;

  -- Generates demo cases and imports archives. **Separated from the app for a
  -- reason that stands without RLS**: seeding deletes every case, and the
  -- process serving requests must not be able to do that.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ic_seed') THEN
    CREATE ROLE ic_seed LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;

  -- What the server process runs as, and the only role that serves a request.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ic_app') THEN
    CREATE ROLE ic_app LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- The schema belongs to the migration role; the other two are granted use of
-- what it creates, per table, by the migration that creates them.
GRANT USAGE ON SCHEMA public TO ic_app, ic_seed;

-- **No default CREATE on the schema.** Postgres grants it to PUBLIC on
-- `public` historically; revoking it is what stops the app role creating a
-- table beside the ones it is allowed to read.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO ic_migrate;

-- **`FOR ROLE ic_migrate`, and leaving it off is a silent no-op.** Default
-- privileges attach to whoever *creates* the object, and this file is run by an
-- administrator — so unnamed, these would cover tables the administrator makes
-- and none of the ones the schema push makes. It surfaces as `permission denied
-- for table user` on the first query, a long way from this file.
--
-- Set before the schema is pushed, so every table arrives already readable.
-- `GRANT ON ALL TABLES` cannot do this job: it covers what exists when it runs,
-- and at that moment nothing does.
ALTER DEFAULT PRIVILEGES FOR ROLE ic_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ic_app;
-- **No TRUNCATE, and its absence is what makes `install_activity` append-only.**
-- That table's policies refuse UPDATE and DELETE to both roles -- measured, 0
-- rows affected -- but TRUNCATE is a table privilege and bypasses row-level
-- security entirely, so `ic_seed` could empty the audit in one statement while
-- being refused a single-row delete. Nothing in this tree issues a TRUNCATE:
-- the seeder deletes, under the `seeder_writes_across_cases` policy. So the
-- grant was reach nothing used, standing between a demo rebuild and the log.
--
-- **Break-verified against the default privileges, not the `GRANT ON ALL
-- TABLES` below.** A table is created after this file runs, so it takes its
-- privileges from here; restoring TRUNCATE to the other statement left the
-- test green and proved nothing.
ALTER DEFAULT PRIVILEGES FOR ROLE ic_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ic_seed;
ALTER DEFAULT PRIVILEGES FOR ROLE ic_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ic_app, ic_seed;

-- And for tables that already exist, so re-running this on a pushed install
-- catches up rather than leaving it half-granted.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ic_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ic_seed;
-- Catches up an install pushed while the grant above still carried TRUNCATE.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM ic_seed;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ic_app, ic_seed;
