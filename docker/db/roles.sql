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
-- Four roles, separated by what they may do.
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

-- **Created without a password here.** `role-passwords.sql` gives each that logs in one, and
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

  -- Stores prose the app accepted, whatever its writers reach by then. No
  -- login: the app enters it for one save at a time. Its column grants are the
  -- schema step's, since no table exists when this runs.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ic_prose') THEN
    CREATE ROLE ic_prose NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- **Entered, never inherited.** Inheriting would put the prose policies on
-- every query the app makes, and the prose grants beside its own.
GRANT ic_prose TO ic_app WITH INHERIT FALSE, SET TRUE;

-- The schema belongs to the migration role, and the other three may use it.
-- **What each may do to a table is the schema step's, and none of it is
-- here** (`server/src/db/schema/grants.ts`): that step revokes everything and
-- grants exactly what each table needs, in the transaction that makes the
-- tables. So this file may run again at any moment, before or after a push,
-- and change no table privilege.
GRANT USAGE ON SCHEMA public TO ic_app, ic_seed, ic_prose;

-- **No default CREATE on the schema.** Postgres grants it to PUBLIC on
-- `public` historically; revoking it is what stops the app role creating a
-- table beside the ones it is allowed to read.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO ic_migrate;
