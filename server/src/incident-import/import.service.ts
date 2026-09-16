/**
 * An incident becoming rows: mapped, judged against the case, then written.
 *
 * **Preview and commit derive the same way.** `commit` does not trust what
 * `preview` returned -- it re-derives from the payload the client resends and
 * applies the analyst's edits as named fields, so an approval names a row this
 * service built rather than one the client did.
 *
 * Why the derivation is here rather than in the browser, and why nothing is
 * parked between the two, is `openspec/specs/incident-import/design.md`.
 */
import { HttpException, Injectable, Logger } from '@nestjs/common'
import { UnprocessableEntityException } from '@nestjs/common'

import { COLLECTION_SCHEMAS } from '../domain/collections.js'
import { actionWriteSchema, eventWriteSchema } from '../domain/entities/timeline.js'
import { CollectionService, type CollectionDefinition } from '../collections/collection.service.js'
import { ComposedWithoutAnAct } from '../db/act.js'
import type { Executor } from '../db/scope.js'
import type { Candidate, PreviewResult, RawIncident, TimelineCandidate } from '../domain/incident-import.js'
import { parseEntity } from './providers/sentinel/entities.js'
import { mapEntity, startsChecked, SEPARATOR } from './providers/sentinel/mapping.js'
import { matchIn, rememberIn } from '../domain/identity.js'
import { alertToTimeline, entityRefsOf } from './providers/sentinel/alerts.js'
import { PLATFORM } from './providers/sentinel/platform.js'
import { importStamp } from '../db/import-stamp.js'

/** What a candidate is keyed by, so `commit` can name what `preview` showed. */
function candidateId(incident: string, identity: string): string {
  return `${incident}${SEPARATOR}${identity}`
}

const stated = (value: unknown): boolean => value !== undefined && value !== null && value !== ''

/**
 * Fill a candidate's blanks from another incident's naming of the same thing.
 *
 * **Blanks only, so the row does not depend on which incident came first.** A
 * cloud app named with its instance by one incident and without by the other is
 * one row either way, and it carries the instance either way. A field both
 * namings state, and state differently, keeps the first proposer's value.
 */
function enrich(candidate: Candidate, mapped: { fields: Record<string, unknown>; label: string }) {
  let widened = false
  for (const [field, value] of Object.entries(mapped.fields)) {
    if (!stated(value) || stated(candidate.fields[field])) continue
    candidate.fields[field] = value
    widened = true
  }
  // The label is derived from the fields, so a naming that widened them
  // describes the widened row better than the one that did not.
  if (widened && mapped.label) candidate.label = mapped.label
}

/**
 * Refuses a commit naming rows the freshly built plan does not hold.
 *
 * Throws `UnprocessableEntityException` naming how many were not found.
 *
 * **A candidate's id is derived from the payload, not minted and kept**, so
 * anything that changes a row's identity between the preview and the commit
 * changes its id -- a change to the identity rules, to the separator, or to the
 * incident key, and a preview held across any of them. Selection by set
 * membership answers "not selected" to an id nobody recognises, which writes a
 * strict subset of what was approved and reports it as a success.
 *
 * **Both lists, because they name rows the same way.** A correction addressed
 * to an id no candidate carries is dropped just as quietly, and the row is then
 * written with the value the analyst edited away.
 */
function refuseAStaleReview(
  plan: { entities: readonly { id: string }[]; timeline: readonly { id: string }[] },
  approved: readonly string[],
  edits: readonly { id: string }[],
): void {
  const offered = new Set([...plan.entities, ...plan.timeline].map((one) => one.id))
  const named = new Set([...approved, ...edits.map((one) => one.id)])
  const missing = [...named].filter((id) => !offered.has(id))
  if (missing.length === 0) return

  const gone =
    named.size === 1
      ? 'the row it names is'
      : `${String(missing.length)} of the ${String(named.size)} rows it names ` +
        (missing.length === 1 ? 'is' : 'are')
  throw new UnprocessableEntityException(
    `This review is out of date: ${gone} no longer in the import. Run the review again.`,
  )
}

export interface ImportDefinitions {
  byName: Record<string, CollectionDefinition>
  timeline: CollectionDefinition
}

/**
 * The timeline's schema arm, by the row's own `kind`.
 *
 * The same rule `timeline.controller.ts`'s `schemaFor` applies: an event and
 * an action offer different fields, so the arm is chosen by the value rather
 * than declared once. The event arm is the fallback and the wider of the two.
 */
function timelineSchemaFor(row: Record<string, unknown>) {
  return row['kind'] === 'action' ? actionWriteSchema : eventWriteSchema
}

/**
 * What a failed import tells the analyst it left behind.
 *
 * Three states and they read differently: rows that are in the case and want
 * finishing, a run that wrote nothing because the case already held it all,
 * and a run whose caller took the whole act back.
 */
function partlyWrote(entities: number, matched: number, kept: boolean): string {
  if (!kept) {
    return (
      'The import wrote nothing: it failed at the timeline and the whole of it was taken ' +
      'back, the case included. Run it again.'
    )
  }
  if (entities === 0) {
    const already = matched > 0 ? ' Everything it would have added was already in the case.' : ''
    return `The import wrote nothing: it failed at the timeline.${already} Run it again.`
  }
  return (
    `The import partly wrote: ${String(entities)} ` +
    `${entities === 1 ? 'entity' : 'entities'} landed and the timeline did not. ` +
    'Run it again to finish it - what is already there is matched rather than doubled.'
  )
}

@Injectable()
export class ImportService {
  private readonly log = new Logger(ImportService.name)

  constructor(private readonly collections: CollectionService) {}

  /**
   * Map and judge, without writing.
   *
   * **Dedup is a query, not a comparison against what the client fetched.**
   * The verdict for every candidate comes from the rows in this case now, so
   * an entity another analyst added a minute ago is `existing` here rather
   * than a duplicate written a minute later.
   *
   * **The plan is indexed against itself as well**, so several incidents
   * naming one thing propose it once, attributed to the first of them.
   */
  async preview(
    caseId: string | null,
    incidents: readonly RawIncident[],
    defs: ImportDefinitions,
    on?: Executor,
  ): Promise<PreviewResult> {
    const skipped = { unsupportedKind: 0, unmappable: 0 }
    const entities: Candidate[] = []
    const timeline: TimelineCandidate[] = []
    const seen = new Map<string, Candidate>()
    /** An identity to the candidate already proposing it, from any incident. */
    const planned = new Map<string, string>()
    const existing = caseId
      ? await this.existingByIdentity(caseId, defs, on)
      : new Map<string, string>()

    for (const incident of incidents) {
      /** ARM's own entity id to the candidate it became, for the alert links. */
      const byRef = new Map<string, string>()

      for (const raw of incident.entities) {
        const parsed = parseEntity(raw)
        if (!parsed) {
          skipped.unsupportedKind += 1
          continue
        }
        const mapped = mapEntity(parsed)
        if (!mapped) {
          skipped.unmappable += 1
          continue
        }

        // **The plan indexes its own rows as it goes, not only the case's.**
        // `candidateId` carries the incident key, so two incidents naming one
        // host are two ids that never collide and both get written. The later
        // entity points at the candidate the first proposed, which is what
        // keeps its own alert linked to the row rather than to nothing.
        const already = matchIn(mapped.collection, planned, mapped.fields)
        if (already !== undefined) {
          byRef.set(parsed.ref, already)
          const first = seen.get(already)
          // **Widened rather than discarded.** The later naming can carry a
          // field the first left blank -- an app's instance, an address's
          // scope -- and dropping it would lose material the import was given
          // and count nothing, where two rows at least carried both.
          if (first) enrich(first, mapped)
          continue
        }

        const id = candidateId(incident.key, mapped.identity)
        byRef.set(parsed.ref, id)

        const match = matchIn(mapped.collection, existing, mapped.fields) ?? null
        const candidate: Candidate = {
          id,
          incident: incident.key,
          kind: parsed.kind,
          collection: mapped.collection,
          fields: mapped.fields,
          label: mapped.label,
          verdict: match ? 'existing' : 'new',
          existing: match,
          checked: !match && startsChecked(mapped),
        }
        seen.set(id, candidate)
        rememberIn(mapped.collection, planned, mapped.fields, id)
        entities.push(candidate)
      }

      for (const alert of incident.alerts) {
        const row = alertToTimeline(alert, incident)
        if (!row) {
          skipped.unmappable += 1
          continue
        }
        timeline.push({
          id: candidateId(incident.key, row.identity),
          incident: incident.key,
          fields: row.fields,
          label: row.label,
          links: entityRefsOf(alert, incident, byRef, seen),
          checked: true,
        })
      }
    }

    return { entities, timeline, skipped }
  }

  /**
   * Write what the analyst approved: the entities first, then the timeline
   * rows that name them.
   *
   * **Re-derived, never trusted.** The candidates are built again from the
   * payload; `approved` names them and `edits` corrects named fields on them.
   * A client that sent whole rows would be composing bodies again, which is
   * the arrangement this design exists to end.
   */
  async commit(
    caseId: string,
    actorId: string,
    incidents: readonly RawIncident[],
    approved: readonly string[],
    edits: readonly { id: string; field: string; value: unknown }[],
    defs: ImportDefinitions,
    /**
     * A caller's transaction. Every read and both writes go on it, so a failure
     * at any of them takes the rest -- which is what a failure at the timeline
     * reports, rather than naming rows the rollback removed. Left unset, each
     * opens its own and the entities survive.
     */
    on?: Executor,
  ): Promise<{ entities: number; timeline: number; skippedExisting: number }> {
    const plan = await this.preview(caseId, incidents, defs, on)
    refuseAStaleReview(plan, approved, edits)
    const wanted = new Set(approved)
    const editsById = new Map<string, { field: string; value: unknown }[]>()
    for (const edit of edits) {
      editsById.set(edit.id, [...(editsById.get(edit.id) ?? []), edit])
    }

    /** Candidate id to the row id it resolves to, existing or newly written. */
    const resolved = new Map<string, string>()
    let skippedExisting = 0

    const groups: { def: CollectionDefinition; rows: Record<string, unknown>[] }[] = []
    const order: { collection: string; ids: string[] }[] = []

    for (const candidate of plan.entities) {
      if (candidate.existing) {
        resolved.set(candidate.id, candidate.existing)
        if (wanted.has(candidate.id)) skippedExisting += 1
        continue
      }
      if (!wanted.has(candidate.id)) continue

      const def = defs.byName[candidate.collection]
      if (!def) throw new UnprocessableEntityException(`No collection ${candidate.collection}`)

      /**
       * `source` is on no collection's write schema, so `edited()` has already
       * dropped any the payload or a correction carried. Stamping after it is
       * the second refusal rather than the first.
       */
      const fields = {
        ...this.edited(candidate.collection, candidate.fields, editsById.get(candidate.id)),
        ...importStamp(PLATFORM, def.table),
      }
      const group = groups.find((one) => one.def.name === candidate.collection)
      if (group) {
        group.rows.push(fields)
        order.find((one) => one.collection === candidate.collection)?.ids.push(candidate.id)
      } else {
        groups.push({ def, rows: [fields] })
        order.push({ collection: candidate.collection, ids: [candidate.id] })
      }
    }

    const written = await this.collections.createAcross(caseId, actorId, groups, 'refuse', on)
    for (const group of order) {
      const ids = written.ids[group.collection] ?? []
      group.ids.forEach((candidate, at) => {
        const id = ids[at]
        if (id) resolved.set(candidate, id)
      })
    }

    // **The timeline is written after, and in its own call for one reason:**
    // its rows name the entity ids the call above minted. Both are inside the
    // same case and the same guards, and whether a failure here leaves the
    // entities written is `on`'s to decide.
    const rows = plan.timeline
      .filter((one) => wanted.has(one.id))
      .map((one) => ({
        ...this.edited('timeline', one.fields, editsById.get(one.id)),
        ...this.links(one, resolved),
        ...importStamp(PLATFORM, defs.timeline.table),
      }))

    /**
     * **A failure here has already written the entities**, and the store's own
     * error says nothing about them -- so a caller could not tell a run that
     * wrote five rows from one that wrote none, and an analyst who does not
     * immediately retry goes to the case unable to tell what arrived from this
     * import and what was already there.
     *
     * **The retry is the requirement's own answer and this is beside it**, not
     * instead of it: `commit` re-runs `preview`, so a second run matches
     * against the store and finishes the job. This is for the analyst who does
     * not run it again. -> #170
     *
     * **Rethrown, never swallowed.** The first half of the requirement is that
     * a partly written import does not report success, and returning a count
     * here would report exactly that.
     */
    let timeline: { ids: string[] }
    try {
      timeline = rows.length
        ? await this.collections.createMany(defs.timeline, caseId, rows, actorId, 'refuse', on)
        : { ids: [] as string[] }
    } catch (why) {
      /**
       * **This app's own refusal passes through unchanged.** The timeline
       * write runs the case-boundary reference check, and its refusal is
       * deterministic and names the row -- so wrapping it turned a permanent
       * "this file points outside the case, at row 12" into a transient
       * "partly wrote, run it again", which is advice that can only fail and
       * loses the row number to `detail`.
       */
      if (why instanceof HttpException) throw why

      /**
       * **A composition fault is not a partly written import.** `whenCommitted`
       * refuses a write composed into a transaction no act declared, and
       * dressing that as *the import partly wrote, run it again* sends an
       * analyst to look at rows for a defect in how the call was wired.
       * -> `db/act.ts`
       */
      if (why instanceof ComposedWithoutAnAct) throw why

      /**
       * **Whether the entities survive is the caller's transaction to decide.**
       * Left unset, each write opened its own and they are in the case; handed
       * one -- which `POST /imports/case` does, because the case itself is
       * being created in the same act -- the failure takes everything back,
       * and naming rows that landed would send an analyst looking for rows
       * nobody can find.
       */
      const kept = on === undefined
      const entities = kept
        ? Object.values(written.ids).reduce((all, ids) => all + ids.length, 0)
        : 0
      const matched = kept ? skippedExisting : 0

      /**
       * **The store's own words are logged, never served.** They carry
       * constraint names, table names and row values, and the refusal shape
       * this route documents says the cause is in the server log only.
       * -> `wire/refusals.ts`, `openapi.prose.ts`
       */
      this.log.error(
        `An import of case ${caseId} failed at the timeline: ${
          why instanceof Error ? why.message : String(why)
        }`,
      )

      throw new UnprocessableEntityException({
        /**
         * **Read off the counts rather than asserted beside them.** The first
         * draft said "the entities landed" whatever the numbers were, so a
         * retry -- where every entity matches a row already there and nothing
         * is written -- reported a partial write forever, its own `wrote`
         * saying zero three lines below.
         *
         * The sentence is what an analyst sees: `import-sentinel.tsx` puts
         * `error.message` on the screen and reads no other field.
         */
        message: partlyWrote(entities, matched, kept),
        wrote: { entities, skippedExisting: matched, timeline: 0 },
      })
    }

    return {
      entities: Object.values(written.ids).reduce((count, ids) => count + ids.length, 0),
      timeline: timeline.ids.length,
      skippedExisting,
    }
  }

  /**
   * An edit applied and validated, or a refusal naming the field.
   *
   * The collection's own schema decides: an edit is a write like any other,
   * and the analyst correcting a hostname must not be able to put a value in a
   * row that the single-row door would refuse.
   */
  private edited(
    collection: string,
    fields: Record<string, unknown>,
    edits: { field: string; value: unknown }[] | undefined,
  ): Record<string, unknown> {
    const merged = { ...fields }
    for (const edit of edits ?? []) merged[edit.field] = edit.value

    // **The timeline resolves its schema by the row's `kind`, so it is not in
    // `COLLECTION_SCHEMAS` and never will be.** A collection this lookup does
    // not know is a refusal, not a pass: a row written without its schema takes
    // 201 and can then answer 500 on every read of that case's timeline, with
    // no route left that could render the row to delete it.
    const schema =
      collection === 'timeline' ? timelineSchemaFor(merged) : COLLECTION_SCHEMAS[collection]
    if (!schema) {
      throw new UnprocessableEntityException(`No schema for ${collection}; refusing to write it`)
    }
    const parsed = schema.safeParse(merged)
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: `An imported ${collection} row is not valid`,
        errors: parsed.error.issues,
      })
    }
    return parsed.data
  }

  /** Candidate links as row ids, dropping any whose entity was not approved. */
  private links(
    row: TimelineCandidate,
    resolved: ReadonlyMap<string, string>,
  ): Record<string, unknown> {
    const many = (ids: readonly string[]) =>
      ids.map((id) => resolved.get(id)).filter((id): id is string => id !== undefined)
    return {
      systemId: row.links.system ? (resolved.get(row.links.system) ?? null) : null,
      accountIds: many(row.links.accounts),
      networkIndicatorIds: many(row.links.networkIndicators),
      malwareIds: many(row.links.malware),
      cloudAppIds: many(row.links.cloudApps),
    }
  }

  /**
   * Every row already in this case, keyed the way a mapped entity is keyed.
   */
  private async existingByIdentity(
    caseId: string,
    defs: ImportDefinitions,
    on?: Executor,
  ): Promise<Map<string, string>> {
    const index = new Map<string, string>()
    // **The reads are independent, so they wait once rather than once each.**
    // `commit` re-runs the preview, so a serial version costs a large case two
    // round trips per collection per import, all of them inside the wait
    // between the analyst pressing a button and seeing anything.
    //
    // **Given `on`, they queue on that one handle instead**, which is the point
    // rather than a cost: five reads reaching the pool from inside an open
    // transaction is a connection held while five more are asked for, and a
    // pool with none left never answers.
    const listed = await Promise.all(
      Object.entries(defs.byName).map(async ([name, def]) => ({
        name,
        rows: await this.collections.list(def, caseId, on),
      })),
    )
    for (const { name, rows } of listed) {
      for (const row of rows) {
        // **Narrowed rather than asserted.** `list` answers a row shape the two
        // typechecks disagree about -- `tsconfig.json` knows it, the test
        // config sees `unknown` -- and a cast that satisfies one is flagged as
        // unnecessary by the lint reading the other.
        if (typeof row !== 'object' || row === null) continue
        const record: Record<string, unknown> = { ...row }
        const id = record['id']
        if (typeof id !== 'string') continue
        // **First wins**, which is `rememberIn`'s rule and so the spreadsheet
        // door's too. Setting unconditionally kept the last row sharing a
        // weaker naming, and the two doors then updated different records
        // for one arriving row. -> #604
        rememberIn(name, index, record, id)
      }
    }
    return index
  }
}

