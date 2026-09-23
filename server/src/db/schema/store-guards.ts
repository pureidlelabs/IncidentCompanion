/**
 * Rules the store keeps itself, applied after every schema push.
 *
 * `drizzle-kit` manages neither functions nor triggers, so these are plain
 * statements, each idempotent: applying the list twice leaves what applying it
 * once left.
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
  `create or replace function refuse_a_change_to_a_sent_report() returns trigger
     language plpgsql as $$
   begin
     if old.sent_at is not null
        and (pg_trigger_depth() < 2 or not public.the_freeze_passes(old.case_id, to_jsonb(old), to_jsonb(new))) then
       raise exception 'report % was sent at %', old.id, old.sent_at
         using errcode = '${SENT_REPORT_REFUSED}',
               detail = json_build_object('reportId', old.id, 'label', old.label, 'sentAt', old.sent_at)::text;
     end if;
     return coalesce(new, old);
   end $$`,
  `create or replace trigger a_sent_report_is_frozen
     before update or delete on reports
     for each row execute function refuse_a_change_to_a_sent_report()`,

  // Definer, so the report a part names is found whatever the writer's scope
  // lets it read; `for share` waits out a send in flight and reads its stamp.
  `create or replace function refuse_a_part_of_a_sent_report() returns trigger
     language plpgsql security definer set search_path = pg_catalog as $$
   declare
     report record;
   begin
     if pg_trigger_depth() < 2
        or not public.the_freeze_passes(coalesce(old.case_id, new.case_id), to_jsonb(old), to_jsonb(new)) then
       for report in
         select id, label, sent_at from public.reports
          where id in (old.report_id, new.report_id)
          order by id
            for share
       loop
         if report.sent_at is not null then
           raise exception 'report % was sent at %', report.id, report.sent_at
             using errcode = '${SENT_REPORT_REFUSED}',
                   detail = json_build_object('reportId', report.id, 'label', report.label, 'sentAt', report.sent_at)::text;
         end if;
       end loop;
     end if;
     return coalesce(new, old);
   end $$`,
  `create or replace trigger a_sent_reports_parts_are_frozen
     before insert or update or delete on report_blocks
     for each row execute function refuse_a_part_of_a_sent_report()`,
]
