/**
 * A form, described by the schema that validates it.
 *
 * **One declaration feeds five things**: the Drizzle column types, the request
 * validation, the OpenAPI document (`z.toJSONSchema`), the TypeScript types
 * (`z.infer`) and the TanStack form, which takes a Zod schema directly through
 * Standard Schema v1. No adapters anywhere in that chain.
 *
 * **The spec is a description, never a decision.** `enabledBy` is published
 * and never evaluated here, and a reference field carries no options because
 * they are the open case's rows - resolving either is a second implementation
 * of the dialog.
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
   * Tags. **A csv string underneath, not a list** - `entry_tags` is what every
   * reader goes through, and a chips control that stored an array would give
   * the filter a second shape to understand.
   */
  | 'tag_select'
  /** One reference to another collection's row. */
  | 'device_select'
  /** Many references. */
  | 'multi_device_select'

/**
 * The three surfaces an entity dialog stacks, in reading order.
 *
 * Closed rather than a free string: the dialog draws three specific things -
 * a plate, a grid and a folded band, and a fourth name would render nowhere.
 *
 * **A type and not a served list, where `FieldKind` is both.** `field_kinds`
 * rides the wire so `assertKnownKinds` can tell a client it is being asked to
 * draw something it has never heard of - the renderer's fallback is a text box,
 * which looks finished and posts the wrong type. A tier has no such fallback:
 * the client imports this union through `@contract/field-spec`, so a fourth
 * name is a compile error rather than a silent bucket.
 */
export type FieldTier = 'identity' | 'assessment' | 'detail'

export interface FieldMeta {
  label: string
  kind: FieldKind

  /**
   * The vocabulary this field's options come from. The options are **inlined**
   * when the spec is served, with the name travelling beside them so a client
   * can still tell that two fields share one list.
   */
  vocabulary?: string


  /**
   * A consequence the analyst cannot see from the screen.
   *
   * **Not an explanation of the control.** *Two tenants of one application are
   * two rows* is a consequence; *pick the kind first* describes the widget,
   * and a control that needs that is the wrong control. The case door has
   * carried these since it was split in two, passed per door; a collection row
   * has one door, so the spec is where it belongs.
   */
  hint?: string

  /**
   * Which of an entity dialog's three surfaces this field opens.
   *
   * **The schema says what a field *is for*; the dialog decides how that
   * reads.** `identity` is what the row is keyed on, `assessment` is what the
   * case makes of it, `detail` is linkage, containment and tags. A field
   * naming a tier opens it and the fields after it belong to it, so the
   * declaration order is the reading order and only the boundaries are typed.
   *
   * **It replaced a heuristic that was right by luck.** The dialog inferred
   * the split from `subordinate` plus the control kind, which reproduced this
   * schema's own declaration exactly - and put `evidence.collectedAt`, the
   * *when* of a chain of custody, in a band labelled "Links and containment",
   * away from the `collectedBy` its own section groups it with. The kind a
   * field is drawn with is not a claim about how often it is set.
   */
  tier?: FieldTier

  /**
   * Below the fold: a required core is always visible, and this is the
   * optional detail. Not `optional` - that says whether a value is needed,
   * this says where it is drawn.
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
   *
   * **This is the declaration, and the schema's refusal is generated from
   * it** - `withGates` walks the shape and appends the `.refine()`. It was the
   * other way round: a hand-written refinement, and this beside it as a
   * description for the dialog to grey a control off. Two artefacts stating
   * one rule can disagree, and a widened refinement leaves the interface
   * refusing a value the API accepts, silently.
   *
   * **Applicability cannot be derived back out of the validation**, which is
   * why the dependency runs this way and not the other. A schema answers *is
   * this object legal*; a control asks *is this field applicable*. `endDate
   * after startDate` makes some values illegal and the field is still
   * applicable; this makes every value illegal and the field is not. Telling
   * them apart means deciding whether any valid value satisfies the
   * constraint, which over an arbitrary predicate is not decidable - so
   * probing would grey out fields that are merely hard to satisfy.
   *
   * Served to the client under this name, where it greys the control. The
   * dialog evaluates it; nothing here does.
   */
  applicableWhen?: { field: string; oneOf: readonly string[] }

  /**
   * What the generated refusal says when the field does not apply.
   *
   * At the field, for a person - `wording()` in the client passes a `custom`
   * message through untouched, and this is the only message in the set that
   * knows what the rule is about. Required beside `applicableWhen`, because a
   * generated rule with no sentence refuses in zod's own words.
   */
  inapplicable?: string

  /**
   * The collection a reference points at, for `device_select` and
   * `multi_device_select`. **No options travel with it**: they are the open
   * case's rows, so a static list would be a list of nothing.
   */
  refTarget?: string

  /** A heading and blurb drawn above this field. */
  section?: { title: string; copy?: string }
}

/**
 * The registry every entity schema writes into.
 *
 * One registry rather than one per entity: a renderer holding a schema wants
 * its metadata without also being told which form it came from, and the
 * schemas are the keys, so there is nothing to collide.
 */
export const fields = z.registry<FieldMeta>()

/**
 * A field that points at another collection's row and draws no control.
 *
 * Separate from `fields` because `FieldMeta` requires a `label` and a `kind`:
 * everything in that registry is drawn, and this is not. **Read by
 * `referenceFieldsOf` alongside `fields`**, so a reference declared in either
 * is checked against the case boundary.
 */
export const identityReferences = z.registry<{ refTarget: string }>()

/** Mark a field as a reference for the boundary check, with no control drawn. */
export function identityReference<T extends z.ZodType>(schema: T, target: string): T {
  identityReferences.add(schema, { refTarget: target })
  return schema
}

/**
 * What a column holds when nothing is supplied, or `undefined` if it insists.
 *
 * **Asked of the column, never of the control kind.** A kind cannot answer
 * this and a table keyed on one gets a third of the tree wrong: the 13
 * single-reference columns refuse `''` and store `null`, the nullable stamps
 * do the same, and `optionalCount()` stores `null` for *not stated* while `0`
 * is a real answer an analyst may mean - so `0` as the empty for a number
 * quietly records "0 data subjects affected" where the row said nothing.
 *
 * Parsing `undefined` runs the field's own defaults and preprocessors, so it
 * answers in the shape the column stores. Measured over every served form: the
 * result round-trips for every field except the twelve that are required, and
 * a required field has no blank by definition.
 */
export function blankOf(field: z.ZodType): unknown {
  const absent = field.safeParse(undefined)
  return absent.success ? absent.data : undefined
}

/**
 * Adds the refusal each field's `applicableWhen` describes, and hands the
 * object back.
 *
 * **Wrap every entity object that declares one.** A gate on an unwrapped
 * schema serves a descriptor and greys a control while refusing nothing, so
 * the interface stops the analyst and the API does not -
 * `field-spec.test.ts` fails on exactly that.
 *
 * The rule is *a value in an inapplicable field*, never *a value at all*: an
 * empty field is always legal, which is what lets the client clear the field
 * rather than block the save. Pointed at the field's own path, because a
 * root-level issue has nowhere to render and reads as the form being broken.
 *
 * **`.refine()` appends to `_zod.def.checks` and returns the same object**, so
 * `hasCrossFieldRule` sees a generated rule exactly as it saw a hand-written
 * one - which is what keeps `refuseIfCrossFieldRuleBroken` enforcing it on
 * every patch.
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
     * A required field cannot be sealed: writing its blank posts a value the
     * column rejects, and leaving the value posts the one the gate calls
     * meaningless. Neither is a state to ship, so the declaration is refused
     * at module load, where a developer sees it.
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
 *
 * **Detected rather than listed**, so a second such schema needs nothing
 * registered anywhere: `CollectionService` asks this before reading a stored
 * row, and a collection without one pays no read.
 *
 * `.refine()` in Zod 4 returns the same `ZodObject` with the check appended to
 * `_zod.def.checks` rather than a wrapper, which is exactly why `patchSchema`
 * can rebuild from `.shape` and drop it with no type error. `field-spec.test.ts`
 * pins that shape, so a Zod upgrade that moves it fails there rather than
 * turning this silently false and the rule silently unenforced.
 */
export function hasCrossFieldRule(schema: z.ZodObject): boolean {
  const checks = (schema as unknown as { _zod?: { def?: { checks?: unknown[] } } })._zod?.def?.checks
  return (checks?.length ?? 0) > 0
}

/**
 * The body a PATCH may carry: every field optional, **every default
 * unwrapped**, nothing else.
 *
 * `.partial()` alone is not this - it marks a field optional and leaves the
 * default underneath, which fires on absent input and turns a one-column patch
 * into an UPDATE that resets the row.
 *
 * **Strict, so an unknown key is refused rather than dropped.** That is what
 * makes mass assignment structural: `version`, `caseId` and `createdBy` are
 * not in a domain schema, so nothing has to enumerate them.
 *
 * **A cross-field rule does not survive this, and cannot.** The body is rebuilt
 * from `.shape` and an object-level `.refine` is not in a shape - but carrying
 * it across would not work either: a patch clearing one half sends no other
 * half, so the rule reads `undefined` and passes. Such a rule is a property of
 * the row the write leaves behind, and `CollectionService` checks it there.
 * -> `collections/collection.service.ts`, `refuseIfCrossFieldRuleBroken`
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
 *
 * **Object key order is the field order**, which is why every schema is
 * written in the order it is drawn. A field with no metadata is skipped rather
 * than guessed at: it is a value the API carries and the form does not draw.
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
 *
 * Both halves are load-bearing - `z.iso.datetime()` alone refuses a `Date`,
 * and `z.date()` parses but cannot be published, so `toJSONSchema` throws.
 *
 * **The input is annotated `string | Date`, not the `unknown` `preprocess`
 * infers.** `@ZodResponse` types the handler off the *input*, so `unknown`
 * makes every stamp unreadable to the route's own caller.
 * -> `read-stamp.test.ts`
 */
export const readStamp = (): z.ZodType<string, string | Date> =>
  z.preprocess(
    (value) => (value instanceof Date ? value.toISOString() : value),
    z.iso.datetime(),
  ) as unknown as z.ZodType<string, string | Date>

/**
 * What every case-owned row carries beyond the fields an analyst fills in - a
 * schema rather than a type, so a route has something to hand `@ZodResponse`.
 *
 * `id` is not here: several schemas already carry their own through `owned()`,
 * and naming it twice makes two declarations disagree about whose it is.
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
 *
 * **`loose`, because a plain object strips.** One implementation serves every
 * entity collection, so this schema cannot name their fields - and declaring
 * only the envelope strictly deletes every one of them from the response while
 * still answering 200. -> `response-verification.test.ts`
 */
export const caseOwnedRowSchema = envelopeSchema.extend({ id: z.uuid() }).loose()
