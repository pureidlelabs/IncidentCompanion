/**
 * Idempotent statements the Drizzle schema cannot express -- functions,
 * triggers -- applied by `server/scripts/apply-schema.mts` after the tables,
 * in the same transaction.
 */

/** The SQLSTATE the store raises for a write to a sent report; its detail is the report as JSON. */
export const SENT_REPORT_REFUSED = 'ICF01'

/** The report a refused write named, where `error` is the store refusing a write to a sent report. */
export function sentReportIn(error: unknown): { id: string; label: string | null; sentAt: Date } | undefined {
  for (let at: unknown = error; at instanceof Object; at = (at as { cause?: unknown }).cause) {
    const { code, detail } = at as { code?: unknown; detail?: unknown }
    if (code !== SENT_REPORT_REFUSED || typeof detail !== 'string') continue
    const report = JSON.parse(detail) as { reportId: string; label: string | null; sentAt: string }
    return { id: report.reportId, label: report.label, sentAt: new Date(report.sentAt) }
  }
  return undefined
}

export const storeGuards: readonly string[] = [
  // Which write the store issues for another passes: the case's removal, an
  // account's, or a piece of evidence's, whose figure a sent report froze by content.
  `create or replace function the_freeze_passes(case_id uuid, old jsonb, new jsonb) returns boolean
     language sql security definer set search_path = pg_catalog as $$
     select not exists (select 1 from public.cases c where c.id = the_freeze_passes.case_id)
         or coalesce(new - 'created_by' - 'updated_by' - 'evidence_id'
                     = old - 'created_by' - 'updated_by' - 'evidence_id', false)
   $$`,
  `revoke all on function the_freeze_passes(uuid, jsonb, jsonb) from public`,
  // Definer, because the_freeze_passes answers its owner and nobody else.
  `create or replace function refuse_a_change_to_a_sent_report() returns trigger
     language plpgsql security definer set search_path = pg_catalog as $$
   begin
     if old.sent_at is not null
        and (pg_trigger_depth() < 2 or not public.the_freeze_passes(old.case_id, to_jsonb(old), to_jsonb(new))) then
       raise exception 'report % was sent at %', old.id, old.sent_at
         using errcode = '${SENT_REPORT_REFUSED}',
               detail = json_build_object('reportId', old.id, 'label', old.label, 'sentAt', old.sent_at)::text;
     end if;
     return coalesce(new, old);
   end $$`,
  // Checked when a trigger is made, never when it fires.
  `revoke all on function refuse_a_change_to_a_sent_report() from public`,
  `create or replace trigger a_sent_report_is_frozen
     before update or delete on reports
     for each row execute function refuse_a_change_to_a_sent_report()`,

  // Definer, so the report a part names is found whatever the writer's scope
  // lets it read; `for share` waits out a send in flight and reads its stamp.
  // Before row security, the report a part leaves; after it, the one it joins,
  // so no case the writer does not reach is read. Only the first asks the
  // freeze: a store-issued write never moves a part between reports.
  // A report outside the part's case is refused as a missing one, before the
  // foreign key would lock it; for the app role only where its write policy
  // admits the row, so any other row gets that policy's own refusal.
  `create or replace function refuse_a_part_of_a_sent_report() returns trigger
     language plpgsql security definer set search_path = pg_catalog as $$
   declare
     report record;
     named uuid;
   begin
     if tg_when = 'BEFORE' then
       if tg_op <> 'DELETE'
          and (session_user::text <> 'ic_app'
               or (new.case_id = nullif(current_setting('app.case_id', true), '')::uuid
                   and (select r.present and r.level in ('write', 'delete')
                          from public.ic_reach(public.ic_principal(), new.case_id) r)))
          and not exists (select 1 from public.reports where id = new.report_id and case_id = new.case_id) then
         raise exception 'insert or update on table "report_blocks" names no report of its case'
           using errcode = '23503';
       end if;
       if tg_op <> 'INSERT'
          and (pg_trigger_depth() < 2 or not public.the_freeze_passes(old.case_id, to_jsonb(old), to_jsonb(new))) then
         named := old.report_id;
       end if;
     elsif tg_op = 'INSERT' or new.report_id is distinct from old.report_id then
       named := new.report_id;
     end if;
     select id, label, sent_at into report from public.reports where id = named for share;
     if report.sent_at is not null then
       raise exception 'report % was sent at %', report.id, report.sent_at
         using errcode = '${SENT_REPORT_REFUSED}',
               detail = json_build_object('reportId', report.id, 'label', report.label, 'sentAt', report.sent_at)::text;
     end if;
     return coalesce(new, old);
   end $$`,
  `revoke all on function refuse_a_part_of_a_sent_report() from public`,
  `create or replace trigger a_sent_reports_parts_are_frozen
     before insert or update or delete on report_blocks
     for each row execute function refuse_a_part_of_a_sent_report()`,
  `create or replace trigger a_sent_report_takes_no_new_part
     after insert or update on report_blocks
     for each row execute function refuse_a_part_of_a_sent_report()`,

  // Invoker, so `current_user` is the writer: the tables' owner inside the
  // store's own move, or the seeder attributing what nobody had.
  `create or replace function refuse_a_customer_change() returns trigger
     language plpgsql set search_path = pg_catalog as $$
   begin
     if current_user <> 'ic_seed'
        and (select relowner from pg_class where oid = tg_relid)
            <> (select oid from pg_roles where rolname = current_user) then
       raise exception 'case % changes customer only through the store''s move', old.id
         using errcode = '42501';
     end if;
     return new;
   end $$`,
  `revoke all on function refuse_a_customer_change() from public`,
  `create or replace trigger a_case_changes_customer_only_by_the_move
     before update of customer_id on cases
     for each row when (old.customer_id is distinct from new.customer_id)
     execute function refuse_a_customer_change()`,
]
