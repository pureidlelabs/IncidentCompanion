/**
 * What the browser posts to import an incident, and what it gets back.
 *
 * **The browser holds the token and nothing else.** It signs in to the
 * provider, pages incidents and fetches one incident's detail -- that is all
 * the work the token forces into the client. The payloads it collects cross
 * this boundary unread: mapping, identity and the write are the server's,
 * because the schemas, the reference registries and the transaction are here.
 *
 * **Two calls, and the second resends the payload.** `preview` maps and dedups
 * without writing; the analyst reviews; `commit` re-derives from the same raw
 * payload and writes what they approved. Nothing is parked between them, so a
 * review that is abandoned leaves nothing behind and two analysts reviewing the
 * same incident do not share state.
 *
 */
import { z } from 'zod'

import { IMPORTABLE } from './collections.js'

/**
 * **A ceiling on a body that is somebody else's JSON.** A workspace can hold
 * an incident with hundreds of entities, and this is parsed before anything
 * about it is known.
 */
export const MAX_INCIDENTS = 50
export const MAX_ENTITIES = 2000

/**
 * One incident as the provider sent it.
 *
 * **`alerts` and `entities` stay opaque here**, exactly as the protocol this
 * replaces kept `RemoteIncident.raw` opaque: only the provider that produced
 * them reads them, and a shape stated here would be Sentinel's shape imposed
 * on the next provider. The provider's own parser is what refuses a malformed
 * payload, per kind, with the field names of that vendor.
 */
export const rawIncidentSchema = z
  .object({
    key: z.string().trim().min(1).max(400),
    title: z.string().trim().max(400).default(''),
    alerts: z.array(z.record(z.string(), z.unknown())).max(MAX_ENTITIES),
    entities: z.array(z.record(z.string(), z.unknown())).max(MAX_ENTITIES),
  })
  .strict()

/**
 * **No floor on `incidents`, and that is the document's doing.** A `.min(1)`
 * reads as reasonable and makes the published reference wrong: the API document
 * carries a generated instance of this schema, an empty array is what a
 * generator produces, and the route then refuses the body its own description
 * offers. Importing nothing is a no-op that answers zero -- which is a better
 * contract than a refusal nobody can act on.
 * -> `test/documented-bodies.test.ts`
 */
export const previewBodySchema = z
  .object({
    provider: z.literal('sentinel'),
    incidents: z.array(rawIncidentSchema).max(MAX_INCIDENTS),
  })
  .strict()

/** What the analyst is deciding about: one row, already mapped and judged. */
export const candidateSchema = z
  .object({
    /**
     * Stable for one payload, and derived from it rather than minted: the
     * commit resends the same payload and recomputes, so an id that changed
     * between the two calls would approve a different row than the one shown.
     */
    id: z.string(),
    incident: z.string(),
    /** The provider's own kind, for the review row's label. */
    kind: z.string(),
    collection: z.enum(IMPORTABLE as [string, ...string[]]),
    /** Already valid for `collection`: the server mapped it. */
    fields: z.record(z.string(), z.unknown()),
    label: z.string(),
    /**
     * **Two, not three.** A `duplicate` arm was declared and never emitted:
     * `preview` skips a candidate already seen in the same payload with a
     * `continue`, so a second copy is not a row with a verdict -- it is not a
     * row. A value the server cannot produce is a branch every client owes
     * and none can reach.
     */
    verdict: z.enum(['new', 'existing']),
    /** The row this matches, when the verdict is `existing`. */
    existing: z.uuid().nullable(),
    checked: z.boolean(),
  })
  .strict()

/** A timeline entry, with its links named by candidate id rather than row id. */
export const timelineCandidateSchema = z
  .object({
    id: z.string(),
    incident: z.string(),
    fields: z.record(z.string(), z.unknown()),
    label: z.string(),
    links: z.object({
      system: z.string().nullable(),
      accounts: z.array(z.string()),
      networkIndicators: z.array(z.string()),
      malware: z.array(z.string()),
      cloudApps: z.array(z.string()),
    }),
    checked: z.boolean(),
  })
  .strict()

export const previewResultSchema = z
  .object({
    entities: z.array(candidateSchema),
    timeline: z.array(timelineCandidateSchema),
    /** Stated rather than silent: a skip that is not counted looks like a bug. */
    skipped: z.object({
      unsupportedKind: z.number().int(),
      unmappable: z.number().int(),
    }),
  })
  .strict()

/**
 * A correction the analyst made in the review panel.
 *
 * **A named field on a named candidate, never a whole row.** The server
 * re-derives every row from the payload at commit; an edit is applied on top
 * and validated by the collection's own schema. Accepting rows would put the
 * client back in the business of composing bodies, which is the arrangement
 * this design exists to end.
 */
export const editSchema = z
  .object({ id: z.string(), field: z.string().max(64), value: z.unknown() })
  .strict()

export const commitBodySchema = previewBodySchema
  .extend({
    approved: z.array(z.string()).max(MAX_ENTITIES),
    edits: z.array(editSchema).max(MAX_ENTITIES).default([]),
  })
  .strict()

export const importedSchema = z
  .object({
    entities: z.number().int(),
    timeline: z.number().int(),
    skippedExisting: z.number().int(),
  })
  .strict()

export type RawIncident = z.infer<typeof rawIncidentSchema>
export type Candidate = z.infer<typeof candidateSchema>
export type TimelineCandidate = z.infer<typeof timelineCandidateSchema>
export type PreviewResult = z.infer<typeof previewResultSchema>
export type CommitBody = z.infer<typeof commitBodySchema>
export type Imported = z.infer<typeof importedSchema>
