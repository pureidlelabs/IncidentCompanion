/**
 * A form, described by the schema that validates it.
 */
import { z } from 'zod'

/**
 * How a field is drawn. Lifted from the Python spec vocabulary; the renderer
 * decides what each means, and the server never draws anything.
 */
export type FieldKind =
  | 'text'
  /** A whole number. Rendered as a numeric input, never a free text box. */
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'color'
  | 'autocomplete'
  | 'event_datetime'
  /**
   * Tags.
   */
  | 'tag_select'
  /** One reference to another collection's row. */
  | 'device_select'
  /** Many references. */
  | 'multi_device_select'

/**
 * The three surfaces an entity dialog stacks, in reading order.
 */
export type FieldTier = 'identity' | 'assessment' | 'detail'

export interface FieldMeta {
  label: string
  kind: FieldKind

  /**
   * The vocabulary this field's options come from.
   */
  vocabulary?: string


  /**
   * A consequence the analyst cannot see from the screen.
   */
  hint?: string

  /**
   * Which of an entity dialog's three surfaces this field opens.
   */
  tier?: FieldTier

  /**
   * Below the fold: a required core is always visible, and this is the optional
   * detail.
   */
  subordinate?: boolean

  /** Spans the dialog rather than sharing a row. */
  fullWidth?: boolean

  /** Sits in the footer strip with the colour and the flags. */
  footerRow?: boolean

  /** Opens at the current time rather than empty. */
  defaultsNow?: boolean

  /** This field's value sets the entry's colour. */
  drivesColour?: string

  /**
   * The checkbox that makes this field usable. **Published, never evaluated
   * here** - the dialog owns the behaviour.
   */
  enabledBy?: string

  /**
   * The values of another field that make this one **applicable**, for a rule
   * a checkbox cannot express.
   */
  applicableWhen?: { field: string; oneOf: readonly string[] }

  /**
   * What the generated refusal says when the field does not apply.
   */
  inapplicable?: string

  /**
   * The collection a reference points at, for `device_select` and
   * `multi_device_select`.
   */
  refTarget?: string

  /** A heading and blurb drawn above this field. */
  section?: { title: string; copy?: string }
}

/**
 * The registry every entity schema writes into.
 */
export const fields = z.registry<FieldMeta>()

/**
 * A field that points at another collection's row and draws no control.
 */
export const identityReferences = z.registry<{ refTarget: string }>()

/** Mark a field as a reference for the boundary check, with no control drawn. */
export function identityReference<T extends z.ZodType>(schema: T, target: string): T {
  identityReferences.add(schema, { refTarget: target })
  return schema
}

/**
 * What a column holds when nothing is supplied, or `undefined` if it insists.
 */
export function blankOf(field: z.ZodType): unknown {
  const absent = field.safeParse(undefined)
  return absent.success ? absent.data : undefined
}

/**
 * Adds the refusal each field's `applicableWhen` describes, and hands the
 * object back.
 */
export function withGates<T extends z.ZodObject>(schema: T): T {
  let out = schema
  for (const [name, sub] of Object.entries(schema.shape)) {
    const meta = fields.get(sub as z.ZodType)
    const gate = meta?.applicableWhen
    if (!gate) continue
    const said = meta?.inapplicable
    if (said === undefined) {
      throw new Error(`${name} declares applicableWhen and no inapplicable message`)
    }
    /**
     * **A gated field must have a blank, and this is where that is refused.**
     */
    const blank = blankOf(sub as z.ZodType)
    if (blank === undefined) {
      throw new Error(`${name} declares applicableWhen and is required, so it has no blank`)
    }
    out = out.refine(
      (row) => {
        const held = (row as Record<string, unknown>)[name]
        if (held === undefined || held === null) return true
        if (Array.isArray(held) && held.length === 0) return true
        if (held === blank) return true
        // **The gate's value is compared as a string and never coerced into
        // one.** A vocabulary is strings; anything else is a mis-declaration,
        // and `String(value)` would answer `[object Object]`, which matches
        // nothing and reads as a value that was compared.
        const against = (row as Record<string, unknown>)[gate.field]
        return typeof against === 'string' && gate.oneOf.includes(against)
      },
      { path: [name], error: said },
    )
  }
  return out
}

/** Attach form metadata to a schema, and give it back for use in an object. */
export function field<T extends z.ZodType>(schema: T, meta: FieldMeta): T {
  fields.add(schema, meta)
  return schema
}

/**
 * Whether a schema carries a rule spanning more than one field.
 */
export function hasCrossFieldRule(schema: z.ZodObject): boolean {
  const checks = (schema as unknown as { _zod?: { def?: { checks?: unknown[] } } })._zod?.def?.checks
  return (checks?.length ?? 0) > 0
}

/**
 * The body a PATCH may carry: every field optional, **every default
 * unwrapped**, nothing else.
 */
export function patchSchema(schema: z.ZodObject): z.ZodObject {
  return z
    .object(
      Object.fromEntries(
        Object.entries(schema.shape).map(([name, sub]) => {
          const field = sub as z.ZodType & { def?: { type?: string; innerType?: z.ZodType } }
          const inner = field.def?.type === 'default' ? field.def.innerType! : field
          return [name, inner.optional()]
        }),
      ),
    )
    .strict()
}

/**
 * The form, in order, for a schema built out of `field()`.
 */
export function formSpec(schema: z.ZodObject): (FieldMeta & { name: string })[] {
  return Object.entries(schema.shape).flatMap(([name, sub]) => {
    const meta = fields.get(sub as z.ZodType)
    return meta ? [{ name, ...meta }] : []
  })
}

/**
 * A timestamp as a *read* answers with it: takes the `Date` a column returns
 * and publishes a string.
 */
export const readStamp = (): z.ZodType<string, string | Date> =>
  z.preprocess(
    (value) => (value instanceof Date ? value.toISOString() : value),
    z.iso.datetime(),
  ) as unknown as z.ZodType<string, string | Date>

/**
 * What every case-owned row carries beyond the fields an analyst fills in - a
 * schema rather than a type, so a route has something to hand `@ZodResponse`.
 */
export const envelopeSchema = z.object({
  caseId: z.uuid(),
  version: z.int().describe('Present this on the next write, or it is refused.'),
  createdAt: readStamp(),
  updatedAt: readStamp(),
  /** Null because deleting an analyst does not delete their work. */
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
})

/**
 * Any case-owned row, with the envelope guaranteed and the collection's own
 * fields passed through.
 */
export const caseOwnedRowSchema = envelopeSchema.extend({ id: z.uuid() }).loose()
