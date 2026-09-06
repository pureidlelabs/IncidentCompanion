/**
 * The timeline: what happened, and what the SOC did about it.
 *
 * **One table, two shapes, and a discriminated union rather than one flat
 * row**, so "an activity has no severity" is a type error. Each form is
 * written out in its own draw order; only the *value* schemas are shared, and
 * they are shared through builders that return a fresh instance per call.
 *
 * **The write schemas are derived from the row schemas, never listed
 * separately** - `omit()` cannot disagree with what it omits from.
 */
import { z } from 'zod'

import { textOf } from '../text-of.js'
import { envelopeSchema, field } from '../field-spec.js'
import { ENTRY_COLOUR } from '../colours.lists.js'
import { ukcCycle, ukcPhase } from '../killchain.js'
import {
  confidenceSchema,
  eventSourceSchema,
  severitySchema,
  tacticSchema,
  ukcPhaseSchema,
  unsettable,
} from '../vocabularies.js'

/**
 * Set by the write path and never by a caller. It is what the report's "how do
 * we know this" column reads, so a caller able to assert `imported` could
 * assert an import that never happened; omitting it from the write schema is
 * the enforcement.
 */
export const PROVENANCE = ['typed', 'imported', 'note'] as const
export const provenanceSchema = z.enum(PROVENANCE)

// --- value builders --------------------------------------------------------
// Each returns a new schema, so the same field can appear in both forms under
// different labels without the registry overwriting one with the other.

const text = (max: number) => z.string().trim().max(max).default('')
const ref = () => z.uuid().nullable().default(null)
const refs = () => z.array(z.uuid()).default([])

/** Server-owned on both kinds. Omitted from the write schemas below. */
const owned = () => ({
  id: z.uuid(),
  provenance: provenanceSchema.default('typed'),
  /** Import-only, and a state that clears where provenance never does. */
  unreviewed: z.boolean().default(false),
  /** This entry's time is where capture happened, not where the event did. */
  timeAssumed: z.boolean().default(false),
})

/**
 * Something observed.
 *
 * Field order is the draw order, so the object is written the way the dialog
 * reads: an always-visible required core, then the optional actors group, then
 * notes, then the footer strip.
 */
export const eventSchema = z.object({
  kind: z.literal('event'),

  description: field(z.string().trim().min(1, 'An entry needs a description.').max(500), {
    label: 'Description (title)',
    kind: 'text',
    fullWidth: true,
    section: { title: 'What happened' },
  }),

  /**
   * `defaultsNow` rather than required: an entry with no time has nowhere to
   * sit in the story, so capture places it at now and says so through
   * `timeAssumed` - which is what keeps it distinguishable from an analyst who
   * typed this exact second.
   */
  time: field(z.iso.datetime(), {
    label: 'Time',
    kind: 'event_datetime',
    fullWidth: true,
    defaultsNow: true,
  }),

  /**
   * The *class* of log, comparable across a case - distinct from `sourceTool`
   * below, which is the product that emitted it and is what an analyst needs
   * to go back and re-query.
   */
  eventSource: field(eventSourceSchema.nullable().default(null), {
    label: 'Telemetry source',
    kind: 'select',
    vocabulary: 'eventSource',
  }),

  /**
   * **The group an analyst has an opinion about, then the frameworks that
   * place it.** Severity and confidence are a pair - how bad, and how sure -
   * and reading one without the other is how a guess gets acted on.
   */
  severity: field(severitySchema.nullable().default(null), {
    label: 'Severity',
    kind: 'select',
    vocabulary: 'severity',
    drivesColour: 'colour',
    section: { title: 'Assessment' },
  }),

  /** Unset is a real state - an imported or templated entry asserts nothing. */
  confidence: field(confidenceSchema.nullable().default(null), {
    label: 'Confidence',
    kind: 'select',
    vocabulary: 'confidence',
    subordinate: true,
  }),

  /**
   * A closed vocabulary, and it has to name one: a `select` naming no
   * vocabulary serves no options, so nothing can be picked from the dialog.
   * -> `vocabularies.TACTIC`
   */
  tactic: field(unsettable(tacticSchema), {
    label: 'MITRE ATT&CK tactic',
    kind: 'select',
    vocabulary: 'tactic',
  }),

  technique: field(text(32), {
    label: 'ATT&CK technique (T1566.001)',
    kind: 'text',
  }),

  /**
   * For the two phases ATT&CK cannot express, and for the entry where the
   * derivation is simply wrong. Never required: a second mandatory phase field
   * is the double entry the derivation removed.
   */
  ukcOverride: field(unsettable(ukcPhaseSchema), {
    label: 'Kill chain phase (override)',
    kind: 'select',
    vocabulary: 'ukcPhase',
    subordinate: true,
  }),

  sourceSystemId: field(ref(), {
    label: 'Source host',
    kind: 'device_select',
    refTarget: 'systems',
    subordinate: true,
    section: { title: 'Actors and location' },
  }),
  systemId: field(ref(), {
    label: 'Destination host',
    kind: 'device_select',
    refTarget: 'systems',
    subordinate: true,
  }),
  accountIds: field(refs(), {
    label: 'Account used',
    kind: 'multi_device_select',
    refTarget: 'accounts',
    subordinate: true,
  }),
  cloudAppIds: field(refs(), {
    label: 'Cloud app',
    kind: 'multi_device_select',
    refTarget: 'cloud_apps',
    subordinate: true,
  }),
  networkIndicatorIds: field(refs(), {
    label: 'Network indicator',
    kind: 'multi_device_select',
    refTarget: 'network_indicators',
    subordinate: true,
  }),
  malwareIds: field(refs(), {
    label: 'Malware sample',
    kind: 'multi_device_select',
    refTarget: 'malware',
    subordinate: true,
  }),
  evidenceIds: field(refs(), {
    label: 'Evidence',
    kind: 'multi_device_select',
    refTarget: 'evidence',
    subordinate: true,
  }),

  /**
   * Where the record came from rather than what it says - the product to
   * re-query, the analyst to ask, and the labels the case files it under.
   *
   * **`methodIds` opens the group rather than closing the actors above it.**
   * A method is how this entry came to be known, which is what every other
   * field here is; grouped with the hosts and accounts it reads as another
   * thing the event involved.
   */
  methodIds: field(refs(), {
    label: 'Found by',
    kind: 'multi_device_select',
    refTarget: 'methods',
    subordinate: true,
    section: { title: 'Provenance' },
  }),
  sourceTool: field(text(120), {
    label: 'Source / tool',
    kind: 'autocomplete',
    subordinate: true,
  }),
  author: field(text(120), { label: 'Recorded by', kind: 'autocomplete', subordinate: true }),
  // `tag_select`, like every other collection's tags: `entry_tags` is the one
  // reader they all go through, so the stored value is the same either way.
  tags: field(text(500), { label: 'Tags', kind: 'tag_select', subordinate: true }),

  notes: field(text(8000), {
    label: 'Notes',
    kind: 'textarea',
    section: { title: 'Notes' },
  }),

  /**
   * **The vocabulary is the column, not a hint beside it.** `vocabulary`
   * reached the served document and no write path, so the column was a
   * `text(32)` accepting `chartreuse` and `not-a-colour` alike - and
   * `TimelineRow` drops the severity token whenever a colour is set, so an
   * out-of-palette value the CSSOM rejects leaves the rail with no colour at
   * all rather than falling back. `''` is the entry that has not been
   * coloured, which is what `automaticColour` reads.
   */
  colour: field(z.enum(ENTRY_COLOUR).or(z.literal('')).default(''), {
    label: 'Colour',
    kind: 'color',
    vocabulary: 'entryColour',
    footerRow: true,
  }),
  hideFromGraph: field(z.boolean().default(false), {
    label: 'Hide on investigation graph',
    kind: 'checkbox',
    footerRow: true,
  }),
  followup: field(z.boolean().default(false), {
    label: 'Flag for follow-up',
    kind: 'checkbox',
    footerRow: true,
  }),

  ...owned(),
})

/**
 * Something the SOC did or received.
 *
 * **No severity, no confidence, no kill chain, no source host, and no
 * hide-from-graph** - a response record is not an observation and does not sit
 * on the investigation graph. Its references say "(if applicable)" because an
 * activity often relates to nothing in particular.
 */
export const actionSchema = z.object({
  kind: z.literal('action'),

  description: field(z.string().trim().min(1, 'An entry needs a description.').max(500), {
    label: 'Description (title)',
    kind: 'text',
    fullWidth: true,
    section: { title: 'What happened' },
  }),

  time: field(z.iso.datetime(), {
    label: 'Time',
    kind: 'event_datetime',
    fullWidth: true,
    defaultsNow: true,
  }),

  actionType: field(text(64), {
    label: 'Action type',
    kind: 'select',
    vocabulary: 'activityAction',
    drivesColour: 'colour',
  }),

  author: field(text(120), {
    label: 'Recorded by',
    kind: 'autocomplete',
    subordinate: true,
    section: { title: 'Context' },
  }),
  systemId: field(ref(), {
    label: 'Host',
    kind: 'device_select',
    refTarget: 'systems',
    subordinate: true,
  }),
  accountIds: field(refs(), {
    label: 'Account',
    kind: 'multi_device_select',
    refTarget: 'accounts',
    subordinate: true,
  }),
  networkIndicatorIds: field(refs(), {
    label: 'Network indicator',
    kind: 'multi_device_select',
    refTarget: 'network_indicators',
    subordinate: true,
  }),
  malwareIds: field(refs(), {
    label: 'Malware sample',
    kind: 'multi_device_select',
    refTarget: 'malware',
    subordinate: true,
  }),
  cloudAppIds: field(refs(), {
    label: 'Cloud app',
    kind: 'multi_device_select',
    refTarget: 'cloud_apps',
    subordinate: true,
  }),
  evidenceIds: field(refs(), {
    label: 'Evidence',
    kind: 'multi_device_select',
    refTarget: 'evidence',
    subordinate: true,
  }),
  methodIds: field(refs(), {
    label: 'Found by',
    kind: 'multi_device_select',
    refTarget: 'methods',
    subordinate: true,
  }),

  notes: field(text(8000), {
    label: 'Notes',
    kind: 'textarea',
    section: { title: 'Notes' },
  }),

  /**
   * **The vocabulary is the column, not a hint beside it.** `vocabulary`
   * reached the served document and no write path, so the column was a
   * `text(32)` accepting `chartreuse` and `not-a-colour` alike - and
   * `TimelineRow` drops the severity token whenever a colour is set, so an
   * out-of-palette value the CSSOM rejects leaves the rail with no colour at
   * all rather than falling back. `''` is the entry that has not been
   * coloured, which is what `automaticColour` reads.
   */
  colour: field(z.enum(ENTRY_COLOUR).or(z.literal('')).default(''), {
    label: 'Colour',
    kind: 'color',
    vocabulary: 'entryColour',
    footerRow: true,
  }),
  followup: field(z.boolean().default(false), {
    label: 'Flag for follow-up',
    kind: 'checkbox',
    footerRow: true,
  }),

  ...owned(),
})

export const timelineEntrySchema = z.discriminatedUnion('kind', [eventSchema, actionSchema])
export type TimelineEntry = z.infer<typeof timelineEntrySchema>

/**
 * The server-owned keys the write schemas omit.
 *
 * **The write schemas are `.strict()`, and omitting that is the whole
 * defect.** Zod strips unknown keys by default, so a `PATCH` naming
 * `provenance` would parse cleanly with the field discarded - success reported
 * for a call that changed nothing.
 */
const OWNED = { id: true, provenance: true, unreviewed: true, timeAssumed: true } as const

/**
 * `time` on the way **in**, where a stored row's is required and a write's is
 * not: capture places a timeless entry at now and says so through
 * `timeAssumed`.
 *
 * **Absent and `''` mean the same thing**, deliberately - both are the analyst
 * not having been given a time, so the client needs no helper to tell them
 * apart.
 *
 * The metadata is re-attached because it rides on the schema *instance*: an
 * `.extend()` with a bare Zod type takes the Time control off the form.
 */
const writtenTime = (label: string) =>
  field(z.union([z.iso.datetime(), z.literal('')]).optional(), {
    label,
    kind: 'event_datetime',
    fullWidth: true,
    defaultsNow: true,
  })

export const eventWriteSchema = eventSchema
  .omit(OWNED)
  .extend({ time: writtenTime('Time') })
  .strict()
export const actionWriteSchema = actionSchema
  .omit(OWNED)
  .extend({ time: writtenTime('Time') })
  .strict()

export const timelineWriteSchema = z.discriminatedUnion('kind', [
  eventWriteSchema,
  actionWriteSchema,
])

/**
 * A stored row as a read returns it: **the union, projected, with the envelope
 * and the derived placement on the arm each belongs to.** What
 * `timelineToWire` produces, and what every timeline route answers with.
 *
 * `ukcPhase` and `ukcCycle` are on the event arm only and no column backs
 * them, which is why they are here and in neither write schema.
 */
export const timelineRowSchema = z.discriminatedUnion('kind', [
  eventSchema.extend(envelopeSchema.shape).extend({
    ukcPhase: z.string(),
    ukcCycle: z.enum(['in', 'through', 'out', '']),
  }),
  actionSchema.extend(envelopeSchema.shape),
])

export type TimelineRowShape = z.infer<typeof timelineRowSchema>

/**
 * The envelope columns a stored row carries that the schemas above do not.
 *
 * `id` is deliberately absent: `owned()` already puts it on both arms, so
 * naming it here would project it twice and disagree about whose it is.
 */
const ENVELOPE = ['caseId', 'version', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'] as const

/** `Date` in, ISO string out. JSON has no date, so the wire has never had one. */
function iso(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value
}

/**
 * A stored row as the API means it: **projected onto the arm its `kind`
 * names**, with the placement derived for an event.
 *
 * Driven by the schemas' own keys, so a field added to `eventSchema` is
 * projected the moment it exists. **A key in neither schema is dropped, not
 * passed through** - which is what keeps a column added to the table off the
 * wire until something declares it.
 */
export function timelineToWire(row: Record<string, unknown>): TimelineEntry & Record<string, unknown> {
  const isAction = row['kind'] === 'action'
  const shape = isAction ? actionSchema.shape : eventSchema.shape
  const out: Record<string, unknown> = {}
  for (const key of [...Object.keys(shape), ...ENVELOPE]) out[key] = iso(row[key])

  // Derived here, not stored, and not on an action - every screen that groups
  // by phase reads this rather than carrying the table itself.
  if (!isAction) {
    // A field that is not text is a field that was not filled in: coercing
    // one would hand `ukcPhase` a value to match on. -> `domain/text-of.ts`
    const phase = ukcPhase(
      textOf(out['tactic']),
      textOf(out['technique']),
      textOf(out['ukcOverride']),
    )
    out['ukcPhase'] = phase
    out['ukcCycle'] = ukcCycle(phase)
  }
  return out as TimelineEntry & Record<string, unknown>
}
