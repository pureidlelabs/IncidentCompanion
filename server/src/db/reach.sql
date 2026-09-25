-- The reach decision, and the few acts that have to see past it.
--
-- Applied by every schema application before the tables and their policies:
-- the policies call these, and a policy naming a function that does not exist
-- cannot be created. `check_function_bodies` is off so the bodies may name
-- tables the push has yet to create.
--
-- Each function is `security definer`, owned by the role that owns the tables,
-- so it reads the rows it decides about whatever the caller may read. Each
-- pins its `search_path` and names every table by schema, so nothing the
-- caller puts on the path can stand in for one.
--
-- Dropped and made again, so a changed signature is taken too; the policies
-- calling them are dropped before this runs.
set check_function_bodies = off;

drop function if exists
  public.ic_floor(text, uuid),
  public.ic_level(text, uuid),
  public.ic_reach(text, uuid),
  public.ic_principal(),
  public.ic_move_case(uuid, uuid),
  public.ic_administers(),
  public.ic_cases_behind(uuid),
  public.ic_references_shared(uuid, uuid),
  public.ic_move_cases(uuid, uuid),
  public.ic_cases_tallied(),
  public.ic_artefacts_named(),
  public.ic_sweep_acceptances(),
  public.ic_acceptance_lasts();

-- The level `principal` holds over `owner` by role alone, or null: an account
-- reaches the default customer, an administrator at delete and anybody else at
-- write. A null owner is the default customer. An id naming no account holds no
-- role, so it reaches nothing.
create or replace function public.ic_floor(principal text, owner uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select case when u.role = 'admin' then 'delete' else 'write' end
    from public."user" u
    join public.customers d
      on d.is_default and d.id = coalesce(owner, (select id from public.customers where is_default))
   where u.id = principal
$$;

-- The level `principal` holds over `owner`, or null for none: the strongest of
-- the floor and every group granting it. A membership goes with its account.
create or replace function public.ic_level(principal text, owner uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  with held as (
    select m.level
      from public.group_members m
      join public.group_customers g on g.group_id = m.group_id
     where m.user_id = principal
       and g.customer_id = coalesce(owner, (select id from public.customers where is_default))
    union all
    select public.ic_floor(principal, owner)
  )
  select level
    from held
   where level is not null
   order by array_position(array['read', 'write', 'delete'], level) desc
   limit 1
$$;

-- Whether `kase` exists, whose it is, and the level `principal` holds over it.
-- One row always: an absent case is answered after the same work as one out of
-- reach, and `present` is what tells them apart.
create or replace function public.ic_reach(principal text, kase uuid)
returns table (present boolean, customer uuid, level text)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select found.id is not null,
         resolved.id,
         public.ic_level(principal, resolved.id)
    from (select kase) asked
    left join public.cases found on found.id = asked.kase
    cross join lateral (
      select coalesce(found.customer_id, (select id from public.customers where is_default)) as id
    ) resolved
$$;

-- The principal the transaction carries, which `withCase` and `withReach` set.
create or replace function public.ic_principal()
returns text
language sql stable
set search_path = pg_catalog, pg_temp
as $$ select nullif(current_setting('app.principal', true), '') $$;

-- Moves one case to `destination` as the principal, answering `moved`, or
-- `absent` where they do not write the case, `default` where the destination
-- is the default customer, and `unreached` where the case carries a reference
-- and they do not reach the destination. A case with no reference may land
-- with a customer they do not reach.
create or replace function public.ic_move_case(kase uuid, destination uuid)
returns text
language plpgsql volatile security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  reference text;
begin
  select c.reference into reference
    from public.cases c, public.ic_reach(public.ic_principal(), kase) r
   where c.id = kase and r.present and r.level in ('write', 'delete');
  if not found then
    return 'absent';
  end if;
  if exists (select 1 from public.customers where id = destination and is_default) then
    return 'default';
  end if;
  if coalesce(reference, '') <> '' and public.ic_level(public.ic_principal(), destination) is null then
    return 'unreached';
  end if;
  update public.cases set customer_id = destination where id = kase;
  return 'moved';
end
$$;

-- The acts of a merge, which an administrator makes over customers whose cases
-- they need not reach. Each refuses a principal who is not an administrator.
create or replace function public.ic_administers()
returns boolean
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$ select exists (select 1 from public."user" where id = public.ic_principal() and role = 'admin') $$;

create or replace function public.ic_cases_behind(owner uuid)
returns integer
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not public.ic_administers() then
    raise exception 'only an administrator counts the cases behind a customer' using errcode = '42501';
  end if;
  return (select count(*)::int from public.cases where customer_id = owner);
end
$$;

create or replace function public.ic_references_shared(losing uuid, surviving uuid)
returns table (reference text, losing_case uuid, surviving_case uuid)
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not public.ic_administers() then
    raise exception 'only an administrator compares two customers' using errcode = '42501';
  end if;
  return query
    select one.reference, one.id, other.id
      from public.cases one
      join public.cases other on other.reference = one.reference
     where one.customer_id = losing
       and other.customer_id = surviving
       and one.reference <> ''
     order by one.reference;
end
$$;

create or replace function public.ic_move_cases(losing uuid, surviving uuid)
returns integer
language plpgsql volatile security definer
set search_path = pg_catalog, pg_temp
as $$
declare moved integer;
begin
  if not public.ic_administers() then
    raise exception 'only an administrator merges customers' using errcode = '42501';
  end if;
  update public.cases set customer_id = surviving where customer_id = losing;
  get diagnostics moved = row_count;
  return moved;
end
$$;

-- How many cases stand in each state, demonstrations apart, for an
-- administrator: counts only, which the install reports of itself.
create or replace function public.ic_cases_tallied()
returns table (status text, is_demo boolean, count integer)
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not public.ic_administers() then
    raise exception 'only an administrator counts every case' using errcode = '42501';
  end if;
  return query select c.status::text, c.is_demo, count(*)::int from public.cases c group by 1, 2;
end
$$;

-- Every digest a case names, by case: what its stored evidence names, and every
-- figure a sent report of it froze (the figures `figuresOf` finds). Asked for
-- nobody, so it answers case ids and digests and never what a case holds.
create or replace function public.ic_artefacts_named()
returns table (case_id uuid, hash text, stored boolean)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select e.case_id, e.hash, true from public.evidence e
   where e.stored_at is not null and e.hash <> ''
  union
  select r.case_id, figure #>> '{}', false
    from public.reports r,
         jsonb_path_query(r.frozen, 'lax $.sections[*].nodes[*] ? (@.type == "figure").hash ? (@.type() == "string")') figure
   where r.frozen is not null
$$;

-- How long a prose acceptance authorises storing what it accepted, and the
-- one place that says so: the policies and the sweep both ask it.
create or replace function public.ic_acceptance_lasts()
returns interval
language sql immutable
set search_path = pg_catalog, pg_temp
as $$ select interval '24 hours' $$;

-- Removes every prose acceptance past its lasting, whatever case it is in,
-- and answers nothing: the application asks for it naming nobody, so it can
-- see none of the rows it removes.
create or replace function public.ic_sweep_acceptances()
returns void
language sql volatile security definer
set search_path = pg_catalog, pg_temp
as $$
  delete from public.prose_acceptances where accepted_at <= now() - public.ic_acceptance_lasts()
$$;

revoke all on function
  public.ic_floor(text, uuid),
  public.ic_level(text, uuid),
  public.ic_reach(text, uuid),
  public.ic_principal(),
  public.ic_move_case(uuid, uuid),
  public.ic_administers(),
  public.ic_cases_behind(uuid),
  public.ic_references_shared(uuid, uuid),
  public.ic_move_cases(uuid, uuid),
  public.ic_cases_tallied(),
  public.ic_artefacts_named(),
  public.ic_sweep_acceptances(),
  public.ic_acceptance_lasts()
from public;

grant execute on function
  public.ic_floor(text, uuid),
  public.ic_level(text, uuid),
  public.ic_reach(text, uuid),
  public.ic_principal(),
  public.ic_move_case(uuid, uuid),
  public.ic_administers(),
  public.ic_cases_behind(uuid),
  public.ic_references_shared(uuid, uuid),
  public.ic_move_cases(uuid, uuid),
  public.ic_cases_tallied(),
  public.ic_artefacts_named(),
  public.ic_sweep_acceptances(),
  public.ic_acceptance_lasts()
to ic_app, ic_seed;

-- The policies the prose role meets call these. It names nobody, so reach
-- answers it nothing.
grant execute on function public.ic_reach(text, uuid), public.ic_acceptance_lasts() to ic_prose;

reset check_function_bodies;
