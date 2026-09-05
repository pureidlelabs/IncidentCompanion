/**
 * `GET /api/specs` - every form, vocabulary and tier the screens are drawn
 * from, serialised out of the same Zod schemas the write path validates with.
 */
import { Controller, Get } from '@nestjs/common'
import { z } from 'zod'

import { CASE_WRITABLE, INCIDENT_CLASS, caseFormSchema } from '../domain/case.js'
import {
  ACTION_TYPE_COLOUR,
  ENTRY_COLOUR,
  SEVERITY_COLOUR,
} from '../domain/colours.lists.js'
import { NOUNS, SCREEN_KEY } from '../domain/collections.js'
import { blankOf, fields as fieldRegistry, type FieldKind, type FieldMeta } from '../domain/field-spec.js'
import { accountSchema } from '../domain/entities/account.js'
import { cloudAppSchema } from '../domain/entities/cloud-app.js'
import { evidenceSchema } from '../domain/entities/evidence.js'
import { methodSchema } from '../domain/entities/method.js'
import { impactSchema } from '../domain/entities/impact.js'
import { malwareSchema } from '../domain/entities/malware.js'
import { networkIndicatorSchema } from '../domain/entities/network-indicator.js'
import { systemSchema } from '../domain/entities/system.js'
import { actionSchema } from '../domain/entities/action.js'
import { caseNoteSchema } from '../domain/entities/case-note.js'
import { actionWriteSchema, eventWriteSchema } from '../domain/entities/timeline.js'
import {
  DEFAULT_TACTIC_LINKS,
  EVENT_ALWAYS_CLEAR,
  EVENT_CORE,
  FIELD_KINDS,
  TACTIC_LINKS,
} from '../domain/tiering.js'
import { FIELD_TONES } from '../domain/field-tones.js'
import * as vocab from '../domain/vocabularies.js'
import { COMPLIANCE } from '../domain/compliance-form.js'
import * as compliance from '../domain/vocabularies/compliance.js'
import { ZodResponse, createZodDto } from 'nestjs-zod'

/** Which vocabulary a field's options come from, and what is in it. */
const VOCABULARIES: Record<string, readonly string[]> = {
  severity: vocab.SEVERITY,
  caseStatus: ['open', 'closed'],
  incidentClass: INCIDENT_CLASS,
  confidence: vocab.CONFIDENCE,
  disposition: vocab.DISPOSITION,
  triage: vocab.TRIAGE,
  assetVerdict: vocab.ASSET_VERDICT,
  taskStatus: vocab.TASK_STATUS,
  eventSource: vocab.EVENT_SOURCE,
  taskType: vocab.TASK_TYPE,
  evidenceType: vocab.EVIDENCE_TYPE,
  methodKind: vocab.METHOD_KIND,
  queryGrammar: vocab.QUERY_GRAMMAR,
  systemType: vocab.SYSTEM_TYPE,
  zone: vocab.ZONE,
  consentType: vocab.CONSENT_TYPE,
  indicatorType: vocab.INDICATOR_TYPE,
  verifiedPublisher: vocab.VERIFIED_PUBLISHER,
  tactic: vocab.TACTIC,
  ukcPhase: vocab.UKC_PHASE,
  /**
   * Served ahead of the field that will name it - `case-facts.ts` declares
   * `incidentClass` against this list and nothing imports that module yet.
   */
  verisAction: compliance.VERIS_ACTIONS,
  entryColour: ENTRY_COLOUR,
  activityAction: vocab.ACTIVITY_ACTION,
  dataCategory: vocab.DATA_CATEGORY,
  dataDisposition: vocab.DATA_DISPOSITION,
}

/**
 * The colour each driving field's values resolve to, by field name.
 */
const DRIVEN_COLOUR: Record<string, Readonly<Record<string, string>>> = {
  severity: SEVERITY_COLOUR,
  actionType: ACTION_TYPE_COLOUR,
}

interface WireField extends Record<string, unknown> {
  name: string
  label: string
  kind: string
}

interface SectionMarker {
  section: { title: string; copy?: string }
}

/**
 * The value a `.default()` wrapper supplies, or `undefined` for no default.
 */
function defaultOf(field: z.ZodType): unknown {
  const def = (field as unknown as { def: { type: string; defaultValue?: unknown } }).def
  if (def.type !== 'default') return undefined
  const value = def.defaultValue
  return typeof value === 'function' ? (value as () => unknown)() : value
}

/**
 * What a control of this kind shows when it holds nothing.
 */
const EMPTY_BY_KIND: Partial<Record<FieldKind, unknown>> = {
  checkbox: false,
  number: 0,
  multi_device_select: [],
}

/**
 * The empty value for a field the form does not draw.
 */
function emptyUndrawn(field: z.ZodType): unknown {
  for (const candidate of [false, 0, []]) {
    if (field.safeParse(candidate).success) return candidate
  }
  return ''
}

/**
 * A whole row of this schema with nothing filled in - what a client's
 * optimistic append is completed from, since the create dialog drops blanks.
 */
function blankRow(schema: z.ZodObject): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, sub] of Object.entries(schema.shape)) {
    const field = sub as z.ZodType
    const declared = defaultOf(field)
    /**
     * **`null` is a declared default like any other, and skipping it was the
     * defect.**
     */
    if (declared !== undefined) {
      out[name] = declared
      continue
    }
    const meta = fieldRegistry.get(field)
    out[name] = meta ? (EMPTY_BY_KIND[meta.kind] ?? '') : emptyUndrawn(field)
  }
  return out
}

/**
 * Whether a value has to be supplied: neither optional nor defaulted, and not
 * accepting `undefined`.
 */
function isRequired(field: z.ZodType): boolean {
  return !field.safeParse(undefined).success
}

/** Fields a form needs before it is drawn in more than one column. */
const COLUMN_FLOOR = 6

/** Fields a form needs before a third column is worth the split. */
const THREE_COLUMN_FLOOR = 10

/**
 * How many columns a form is drawn in, derived from what the schema declares.
 */

export function columnsFor(schema: z.ZodObject): 1 | 2 | 3 {
  const metas = Object.values(schema.shape)
    .map((sub) => fieldRegistry.get(sub as z.ZodType))
    .filter((meta): meta is FieldMeta => Boolean(meta))

  if (metas.length <= COLUMN_FLOOR) return 1
  const narrative = metas.some((meta) => meta.kind === 'textarea')
  const linked = metas.some(
    (meta) => meta.kind === 'device_select' || meta.kind === 'multi_device_select',
  )
  const wanted = 1 + (narrative ? 1 : 0) + (linked ? 1 : 0)
  if (wanted === 3 && metas.length < THREE_COLUMN_FLOOR) return 2
  return wanted as 1 | 2 | 3
}

function serialise(schema: z.ZodObject): (WireField | SectionMarker)[] {
  const out: (WireField | SectionMarker)[] = []

  for (const [name, sub] of Object.entries(schema.shape)) {
    const meta = fieldRegistry.get(sub as z.ZodType)
    if (!meta) continue

    // The marker precedes the field that declared it, so the heading lands
    // above its group rather than inside it.
    if (meta.section) out.push({ section: meta.section })

    const field: WireField = { name, label: meta.label, kind: meta.kind }
    if (meta.hint) field['hint'] = meta.hint
    if (meta.tier) field['tier'] = meta.tier
    if (meta.subordinate) field['subordinate'] = true
    if (meta.fullWidth) field['fullWidth'] = true
    if (meta.footerRow) field['footerRow'] = true
    if (meta.defaultsNow) field['defaultsNow'] = true
    if (meta.drivesColour) {
      field['drivesColour'] = meta.drivesColour
      /**
       * **The map beside the flag, or the flag says nothing.**
       */
      field['colourMap'] = DRIVEN_COLOUR[name] ?? {}
    }
    if (meta.enabledBy) field['enabledBy'] = meta.enabledBy
    if (meta.applicableWhen) {
      field['applicableWhen'] = meta.applicableWhen
      /**
       * **The blank travels with the gate, because the dialog seals to it.**
       */
      field['blank'] = blankOf(sub as z.ZodType)
    }

    // Required and default come off the Zod schema, never off `FieldMeta`: a
    // second declaration beside the schema is a second thing to keep true.
    if (isRequired(sub as z.ZodType)) field['required'] = true
    /**
     * A default is served only when it puts a *value* in the control -
     * `initialDraft` seeds the create form from these, and `''`, `false` and
     * `null` are what the control already shows when nothing is set.
     */
    const fallback = defaultOf(sub as z.ZodType)
    const worthSerialising =
      fallback !== undefined && fallback !== null && fallback !== '' && fallback !== false
    if (worthSerialising) field['default'] = fallback

    /**
     * `collection` is the URL segment a picker fetches; `target` is the screen key
     * `ENTITY_TARGETS` is keyed by, which is where a reference's link, its hover
     * card and its "Open in ..." come from.
     */
    if (meta.refTarget) {
      field['ref'] = {
        target: SCREEN_KEY[meta.refTarget] ?? meta.refTarget,
        collection: meta.refTarget,
        noun: NOUNS[meta.refTarget] ?? meta.refTarget,
        multiple: meta.kind === 'multi_device_select',
      }
    } else if (meta.vocabulary) {
      field['vocabulary'] = meta.vocabulary
      field['options'] = VOCABULARIES[meta.vocabulary] ?? []
    }

    out.push(field)
  }
  return out
}

/**
 * What `/api/specs` answers with.
 */
const wireFieldSchema = z.looseObject({
  name: z.string(),
  label: z.string(),
  kind: z.string().describe('Which control draws it \u2014 text, textarea, select, and so on.'),
})

const sectionMarkerSchema = z.object({
  section: z.object({ title: z.string(), copy: z.string().optional() }),
})

const formSchema = z.object({
  collection: z.string(),
  columns: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .describe('How many columns the form is drawn in.'),
  fields: z
    .array(z.union([wireFieldSchema, sectionMarkerSchema]))
    .describe('Descriptors and section markers interleaved, in draw order.'),
  blank: z.record(z.string(), z.unknown()).describe('A new row, with every declared default applied.'),
})

export const specsSchema = z.looseObject({
  forms: z.record(z.string(), formSchema),
  vocabularies: z.record(z.string(), z.unknown()),
  tiering: z.record(z.string(), z.unknown()),
  field_tones: z.record(z.string(), z.unknown()),
  field_kinds: z.unknown(),
  case: z.object({ writable: z.array(z.string()) }),
  compliance: z.unknown(),
})

class SpecsDto extends createZodDto(specsSchema) {}

/**
 * Every form this document publishes: its collection, and the schema it is
 * built from.
 */
export const FORM_SCHEMAS: Readonly<Record<string, { collection: string; schema: z.ZodObject }>> = {
  EVENT_FIELDS: { collection: 'timeline', schema: eventWriteSchema },
  TIMELINE_ACTION_FIELDS: { collection: 'timeline', schema: actionWriteSchema },
  SYSTEM_FIELDS: { collection: 'systems', schema: systemSchema },
  ACCOUNT_FIELDS: { collection: 'accounts', schema: accountSchema },
  NETWORK_FIELDS: { collection: 'network_indicators', schema: networkIndicatorSchema },
  MALWARE_FIELDS: { collection: 'malware', schema: malwareSchema },
  IMPACT_FIELDS: { collection: 'impact', schema: impactSchema },
  CLOUD_APP_FIELDS: { collection: 'cloud_apps', schema: cloudAppSchema },
  EVIDENCE_FIELDS: { collection: 'evidence', schema: evidenceSchema },
  METHOD_FIELDS: { collection: 'methods', schema: methodSchema },
  ACTION_FIELDS: { collection: 'actions', schema: actionSchema },
  CASE_FIELDS: { collection: 'cases', schema: caseFormSchema },
  CASENOTE_FIELDS: { collection: 'casenotes', schema: caseNoteSchema },
}

/** Each form as the document carries it. Hoisted: the shape is per-form data. */
const FORMS = Object.fromEntries(
  Object.entries(FORM_SCHEMAS).map(([name, { collection, schema }]) => [
    name,
    {
      collection,
      columns: columnsFor(schema),
      fields: serialise(schema),
      blank: blankRow(schema),
    },
  ]),
)

@Controller('api/specs')
export class SpecsController {
  /**
   * **Keyed by form, not by entity.**
   */
  @Get()
  @ZodResponse({
    status: 200,
    type: SpecsDto,
    description: 'Every form, vocabulary and tier the screens are drawn from.',
  })
  specs() {
    return {
      // All eleven, keyed by the `*_FIELDS` constant names the sections ask
      // for. `specs.controller.test.ts` fails on a key spelled any other way.
      forms: FORMS,

      vocabularies: VOCABULARIES,

      // Snake_case from here down, and it is not an oversight: `parseSpecs`
      // reads these four by that spelling.
      tiering: {
        event_core: EVENT_CORE,
        event_always_clear: EVENT_ALWAYS_CLEAR,
        tactic_links: TACTIC_LINKS,
        default_tactic_links: DEFAULT_TACTIC_LINKS,
      },
      field_tones: FIELD_TONES,
      field_kinds: FIELD_KINDS,

      /**
       * Which case fields a PATCH accepts, which is not the same set as the
       * form draws and is why this outlives the move into `forms`.
       */
      case: { writable: [...CASE_WRITABLE] },

      /** The Compliance screen's five cards and their forms. */
      compliance: COMPLIANCE,
    }
  }
}
