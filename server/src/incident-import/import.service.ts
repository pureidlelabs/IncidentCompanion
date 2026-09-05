/**
 * An incident becoming rows: mapped, judged against the case, written once.
 */
import { Injectable } from '@nestjs/common'
import { UnprocessableEntityException } from '@nestjs/common'

import { COLLECTION_SCHEMAS } from '../domain/collections.js'
import { actionWriteSchema, eventWriteSchema } from '../domain/entities/timeline.js'
import { CollectionService, type CollectionDefinition } from '../collections/collection.service.js'
import type { Candidate, PreviewResult, RawIncident, TimelineCandidate } from '../domain/incident-import.js'
import { parseEntity } from './providers/sentinel/entities.js'
import { mapEntity, startsChecked, SEPARATOR } from './providers/sentinel/mapping.js'
import { identitiesOf } from '../collections/identity.js'
import { alertToTimeline, entityRefsOf } from './providers/sentinel/alerts.js'
import { IMPORTED_STAMP } from '../collections/timeline.controller.js'

/** What a candidate is keyed by, so `commit` can name what `preview` showed. */
function candidateId(incident: string, identity: string): string {
  return `${incident}${SEPARATOR}${identity}`
}

export interface ImportDefinitions {
  /** The collection definitions to write through, by collection name. */
  byName: Record<string, CollectionDefinition>
  timeline: CollectionDefinition
}

function timelineSchemaFor(row: Record<string, unknown>) {
  return row['kind'] === 'action' ? actionWriteSchema : eventWriteSchema
}

@Injectable()
export class ImportService {
  constructor(private readonly collections: CollectionService) {}

  /**
   * Map and judge, without writing.
   */
  async preview(
    caseId: string | null,
    incidents: readonly RawIncident[],
    defs: ImportDefinitions,
  ): Promise<PreviewResult> {
    const skipped = { unsupportedKind: 0, unmappable: 0 }
    const entities: Candidate[] = []
    const timeline: TimelineCandidate[] = []
    const seen = new Map<string, Candidate>()
    // **No case means nothing to be a duplicate of.** The start door previews
    // an incident before a case exists, and answering the same shape with every
    // verdict `new` is what lets one review screen serve both doors.
    const existing = caseId ? await this.existingByIdentity(caseId, defs) : new Map<string, string>()

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

        const id = candidateId(incident.key, mapped.identity)
        byRef.set(parsed.ref, id)
        if (seen.has(id)) continue

        // **Strongest first, then weaker.** A stored row is keyed on the
        // columns its table has, which for three of the five is less than the
        // provider gives -- so an incoming host with a domain has to try the
        // domain-less form or it imports a second copy of a host already here.
        const match =
          mapped.identities.map((one) => existing.get(one)).find((id) => id !== undefined) ?? null
        const candidate: Candidate = {
          id,
          incident: incident.key,
          kind: parsed.kind,
          collection: mapped.collection,
          fields: mapped.fields,
          label: mapped.label,
          verdict: match ? 'existing' : 'new',
          existing: match,
          // **Unticked when it is already here, or when the provider's own
          // noise says so.** Importing a row the case already holds is the
          // duplicate the analyst came to avoid, and a private address is the
          // one kind that is usually noise.
          checked: !match && startsChecked(mapped),
        }
        seen.set(id, candidate)
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
   * Write what the analyst approved, in one transaction.
   */
  async commit(
    caseId: string,
    actorId: string,
    incidents: readonly RawIncident[],
    approved: readonly string[],
    edits: readonly { id: string; field: string; value: unknown }[],
    defs: ImportDefinitions,
  ): Promise<{ entities: number; timeline: number; skippedExisting: number }> {
    const plan = await this.preview(caseId, incidents, defs)
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

      const fields = this.edited(candidate.collection, candidate.fields, editsById.get(candidate.id))
      const group = groups.find((one) => one.def.name === candidate.collection)
      if (group) {
        group.rows.push(fields)
        order.find((one) => one.collection === candidate.collection)?.ids.push(candidate.id)
      } else {
        const def = defs.byName[candidate.collection]
        if (!def) throw new UnprocessableEntityException(`No collection ${candidate.collection}`)
        groups.push({ def, rows: [fields] })
        order.push({ collection: candidate.collection, ids: [candidate.id] })
      }
    }

    const written = await this.collections.createAcross(caseId, actorId, groups)
    for (const group of order) {
      const ids = written.ids[group.collection] ?? []
      group.ids.forEach((candidate, at) => {
        const id = ids[at]
        if (id) resolved.set(candidate, id)
      })
    }

    // **The timeline is written after, and in its own call for one reason:**
    // its rows name the entity ids the call above minted. Both are inside the
    // same case and the same guards; a failure here leaves entities written,
    // which is the one seam this design does not close and the reason the
    // route reports both counts.
    const rows = plan.timeline
      .filter((one) => wanted.has(one.id))
      .map((one) => ({
        ...this.edited('timeline', one.fields, editsById.get(one.id)),
        ...this.links(one, resolved),
        // The same stamp the bulk route applies, from the same constant.
        ...IMPORTED_STAMP,
      }))

    const timeline = rows.length
      ? await this.collections.createMany(defs.timeline, caseId, rows, actorId)
      : { ids: [] as string[] }

    return {
      entities: Object.values(written.ids).reduce((count, ids) => count + ids.length, 0),
      timeline: timeline.ids.length,
      skippedExisting,
    }
  }

  /**
   * An edit applied and validated, or a refusal naming the field.
   */
  private edited(
    collection: string,
    fields: Record<string, unknown>,
    edits: { field: string; value: unknown }[] | undefined,
  ): Record<string, unknown> {
    const merged = { ...fields }
    for (const edit of edits ?? []) merged[edit.field] = edit.value

    // **The timeline resolves its schema by the row's `kind`, so it is not in
    // `COLLECTION_SCHEMAS` and never will be.** A missing key used to read as
    // "nothing to check" and returned the row untouched -- so an analyst
    // typing `Critical` into a candidate's severity got 201, and then every
    // read of that case's timeline answered 500 for good, with no route left
    // that could render the row to delete it. A collection this does not know
    // is a refusal, not a pass.
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
  ): Promise<Map<string, string>> {
    const index = new Map<string, string>()
    // **The five reads are independent, so they wait once rather than five
    // times.** They ran in sequence on every preview, and `commit` re-runs the
    // preview -- so a large case paid five serial round trips twice per
    // import, on the wait between the analyst pressing a button and seeing
    // anything.
    const listed = await Promise.all(
      Object.entries(defs.byName).map(async ([name, def]) => ({
        name,
        rows: await this.collections.list(def, caseId),
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
        for (const identity of identitiesOf(name, record)) index.set(identity, id)
      }
    }
    return index
  }
}

