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

/**
 * `pg_trigger_depth() > 1` is a write issued by another trigger: a case
 * deleted with its reports, or an account deleted and its name nulled out of
 * the rows it wrote.
 */
export const storeGuards: readonly string[] = [
  `create or replace function refuse_a_change_to_a_sent_report() returns trigger
     language plpgsql as $$
   begin
     if old.sent_at is not null and pg_trigger_depth() < 2 then
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
     if pg_trigger_depth() < 2 then
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
