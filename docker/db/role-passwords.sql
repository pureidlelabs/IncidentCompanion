-- The role passwords, apart from the roles themselves.
--
-- **Split from `roles.sql` because this is the half not every executor can
-- run.** `:'name'` is psql's own syntax, and the values arrive as `-v` from the
-- operator's `.env`. Anything reaching Postgres through a driver instead --
-- `pg`, in the test harness -- has no psql variables, so it runs `roles.sql`
-- alone and is right to: the roles it provisions are never authenticated as,
-- either because they already carry the fixture password or because the
-- in-process engine ignores the wire user entirely.
--
-- So `roles.sql` holds no `:'` at all, which one grep decides for ever, where
-- "every reader remembers to substitute" is a discipline over an open set of
-- callers and cost three inert guards before this split.
--
-- **Every run, so `.env` is the authority.** The guarded creates in `roles.sql`
-- leave an existing role untouched, which would let a role keep a password the
-- operator has since rotated -- and would have kept the shipped `ic_app:ic_app`
-- on any install that ever ran the old file.
ALTER ROLE ic_migrate LOGIN PASSWORD :'ic_migrate_password' NOSUPERUSER NOBYPASSRLS;
ALTER ROLE ic_seed    LOGIN PASSWORD :'ic_seed_password'    NOSUPERUSER NOBYPASSRLS;
ALTER ROLE ic_app     LOGIN PASSWORD :'ic_app_password'     NOSUPERUSER NOBYPASSRLS;
