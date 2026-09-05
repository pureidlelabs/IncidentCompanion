/**
 * The claim this whole approach rests on: one declaration serves the form, the
 * validation, the document and the types.
 *
 * Three of those are asserted here. The fourth - the types - is asserted by
 * the build, and a test could only restate it.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { FORM_SCHEMAS } from '../specs/specs.controller.js'
import { blankOf, field, formSpec, hasCrossFieldRule, withGates, type FieldKind } from './field-spec.js'
import { optionalCount } from './vocabularies.js'
import { networkIndicatorSchema } from './entities/network-indicator.js'
import { DISPOSITION, SEVERITY, TRIAGE } from './vocabularies.js'

/**
 * **`.refine()` does not wrap the object in Zod 4**, so there is nothing to
 * unwrap: it adds a check and hands back a `ZodObject` with `.shape` intact.
 * Zod 3 returned `ZodEffects` and lost `.shape`, which is why every older
 * example reaches for `.innerType` - doing that here yields `undefined` and
 * the failure surfaces as a null-ish error deep inside `toJSONSchema`.
 */
const shape = networkIndicatorSchema

/**
 * The values a schema field accepts, for an enum however it is wrapped.
 *
 * **`.default()` and `.optional()` do wrap, where `.refine()` above does
 * not** - different wrappers, not a contradiction. So they wrap the enum
 * rather than replacing it, and
 * reaching for `.options` on the declared type answers `undefined` on every
 * field that carries a default - which is every vocabulary field here.
 */
function enumValuesOf(field: unknown): string[] {
  let at = field as { options?: readonly string[]; _zod?: { def?: { innerType?: unknown } } }
  for (let hop = 0; hop < 8; hop += 1) {
    if (Array.isArray(at?.options)) return [...at.options] as string[]
    const inner = at?._zod?.def?.innerType
    if (!inner) break
    at = inner
  }
  return []
}

describe('a field spec derived from the schema', () => {
  it('lists the fields in the order they are drawn', () => {
    const spec = formSpec(shape)
    expect(spec.map((f) => f.name).slice(0, 4)).toEqual(['type', 'value', 'scope', 'port'])
  })

  it('carries the label and the control kind for every field', () => {
    // The property that lets the client render without transcribing anything.
    for (const entry of formSpec(shape)) {
      expect(entry.label, entry.name).toBeTruthy()
      expect(entry.kind, entry.name).toBeTruthy()
    }
  })

  it('publishes a reference target and never its options', () => {
    // Options are the open case's rows. A static list would be a list of
    // nothing, which is why the Python serialiser refused to emit one too.
    const host = formSpec(shape).find((f) => f.name === 'systemId')
    expect(host?.refTarget).toBe('systems')
    expect(host).not.toHaveProperty('options')
  })

  it('publishes enabledBy without evaluating it', () => {
    const blockedAt = formSpec(shape).find((f) => f.name === 'blockedAt')
    expect(blockedAt?.enabledBy).toBe('blocked')
  })

  it('publishes applicableWhen without evaluating it', () => {
    const scope = formSpec(shape).find((f) => f.name === 'scope')
    expect(scope?.applicableWhen).toEqual({ field: 'type', oneOf: ['ipv4', 'ipv6'] })
    expect(scope?.inapplicable).toBe('Only an address has a scope.')
  })

  /**
   * **Applicability is the declaration and the refinement is generated from
   * it**, which is what makes the two unable to disagree. A hand-written
   * `.refine()` beside a hand-written gate needs the walk below to hold it
   * level; a generated rule needs no holding, and this is the assertion that
   * says the generation happened at all.
   *
   * **Without it the walk below passes vacuously on a schema with no rule**:
   * a gate declared on an object nobody wrapped serves a descriptor, greys a
   * control, and refuses nothing - the analyst is stopped by the interface and
   * the API is not.
   *
   * **`FORM_SCHEMAS`, not `COLLECTION_SCHEMAS`, because the first is what
   * serves a gate.** The second deliberately omits the timeline's two write
   * schemas and the case form, so a gate declared on any of those was served,
   * greyed a control and refused nothing with this walk still green -
   * measured. `specs.controller.ts` and `collections.ts` both already say
   * *read this, not that* about the same seam, for references.
   */
  it('generates a refusal for every field that declares when it applies', () => {
    const declared: string[] = []

    for (const [form, { schema }] of Object.entries(FORM_SCHEMAS)) {
      for (const spec of formSpec(schema)) {
        if (!spec.applicableWhen) continue
        declared.push(`${form}.${spec.name}`)

        // The rule the wrapper is supposed to have added, from the outside:
        // an inapplicable field carrying a value is refused, at its own path,
        // in the words the schema author wrote.
        const outside = spec.applicableWhen.oneOf
        const illegal = enumValuesOf(schema.shape[spec.applicableWhen.field]).find(
          (value) => !outside.includes(value),
        )
        expect(illegal, `${form}.${spec.name} gates on a field with no value outside the gate`)
          .toBeTruthy()

        const base: Record<string, unknown> = { [spec.applicableWhen.field]: illegal ?? '' }
        for (let hop = 0; hop < 12; hop += 1) {
          const answer = schema.safeParse(base)
          if (answer.success) break
          const missing = answer.error.issues
            .map((issue) => String(issue.path[0] ?? ''))
            .filter((name) => name !== '' && name !== spec.name && !(name in base))
          if (missing.length === 0) break
          for (const name of missing) base[name] = 'gate-probe'
        }

        const refused = schema.safeParse({ ...base, [spec.name]: 'gate-probe' })
        expect(refused.success, `${form}.${spec.name} is not refused when it does not apply`)
          .toBe(false)
        expect(
          refused.error?.issues.map((issue) => issue.path.join('.')),
          `${form}.${spec.name}: the refusal must name the control`,
        ).toContain(spec.name)
        expect(
          refused.error?.issues.find((issue) => issue.path.join('.') === spec.name)?.message,
        ).toBe(spec.inapplicable)

        // And it is not refused when it does apply, or the gate is inverted.
        expect(
          schema.safeParse({ ...base, [spec.applicableWhen.field]: outside[0], [spec.name]: 'gate-probe' })
            .success,
          `${form}.${spec.name} is refused when it does apply`,
        ).toBe(true)
      }
    }

    expect(declared, 'no field declares when it applies - this test measured nothing')
      .not.toEqual([])
  })

  /**
   * **The generator is correct, which is a different claim from the two
   * agreeing.** They cannot disagree any more - one declaration produces both
   * - so what is left to get wrong is `withGates` itself refusing the wrong
   * set. This drives the gate field's whole enum through `safeParse` and holds
   * the generated rule to admitting exactly the declared values.
   *
   * **Two traps in writing it, both of which made it pass while measuring
   * nothing.** Zod runs an object-level `.refine()` only after the shape
   * parses, so a probe carrying just the gated field never reaches the rule
   * and reads every value as accepted - the exact inversion this is for. And
   * `.default()` wraps an enum, so `.options` on the declared type is
   * `undefined` for every vocabulary field.
   */
  it('gates every declared field on exactly the values its refinement accepts', () => {
    const checked: string[] = []

    for (const [form, { schema }] of Object.entries(FORM_SCHEMAS)) {
      for (const spec of formSpec(schema)) {
        const gate = spec.applicableWhen
        if (!gate) continue

        /**
         * **The gate field's vocabulary off the schema, not off the served
         * descriptor.** `FieldMeta` names a vocabulary and the controller
         * resolves it; the enum underneath is what the refinement compares
         * against, so this reads the enum.
         */
        const vocabulary = enumValuesOf(schema.shape[gate.field])
        expect(vocabulary, `${form}.${spec.name} gates on ${gate.field}, which is not an enum`)
          .not.toEqual([])

        /**
         * **An object that parses, or the refinement never runs.** Zod checks
         * an object-level `.refine()` only after the shape itself parses, so a
         * probe missing a required field answers *accepted* for every value of
         * the gate - the rule was never reached. This filled only the gated
         * field and read `domain` as legal, which is the exact inversion the
         * test exists to catch.
         *
         * The base is every required field at a plain string, and it is
         * asserted to parse rather than assumed: a required uuid or number
         * reddens here with what it needs, instead of quietly measuring
         * nothing.
         */
        const base: Record<string, unknown> = { [gate.field]: gate.oneOf[0] }
        // Ask the schema what it is still missing rather than reading a
        // `required` flag off the descriptor - the flag is added by the
        // serialiser, not by `formSpec`, so it is absent here.
        for (let hop = 0; hop < 12; hop += 1) {
          const answer = schema.safeParse(base)
          if (answer.success) break
          const missing = answer.error.issues
            .map((issue) => String(issue.path[0] ?? ''))
            .filter((name) => name !== '' && name !== spec.name && !(name in base))
          if (missing.length === 0) break
          for (const name of missing) base[name] = 'gate-probe'
        }
        const baseParses = schema.safeParse(base).success
        expect(baseParses, `${form}: a probe of required text fields does not parse - this test cannot reach the refinement`)
          .toBe(true)

        for (const value of vocabulary) {
          const accepted = !schema
            .safeParse({ ...base, [gate.field]: value, [spec.name]: 'gate-probe' })
            .error?.issues.some((issue) => issue.path.join('.') === spec.name)
          expect(
            gate.oneOf.includes(value),
            `${form}.${spec.name} with ${gate.field}=${value}`,
          ).toBe(accepted)
        }
        checked.push(`${form}.${spec.name}`)
      }
    }

    // A walk that found nothing passes every assertion above it.
    expect(checked, 'no field declares when it applies - this test measured nothing').not.toEqual([])
  })
})

/**
 * **What a column holds when nothing is supplied, asked of the column.**
 *
 * `emptyFor(kind)` was a table keyed on the control kind, and a kind cannot
 * answer this: the 13 single-reference columns refuse `''` and take `null`,
 * the nullable timestamps do the same, and `optionalCount()` stores `null` for
 * *not stated* while `0` is a real answer an analyst may mean. A table gets
 * one of those wrong whichever value it picks.
 *
 * Parsing `undefined` is the schema's own answer, and the walk below is what
 * says so for every served column rather than for the four a hand-written
 * probe imagines.
 */
describe('the blank a column holds', () => {
  it('round-trips for every field of every served form', () => {
    for (const [form, { schema }] of Object.entries(FORM_SCHEMAS)) {
      for (const spec of formSpec(schema)) {
        const sub = schema.shape[spec.name]
        if (!sub) continue
        const absent = sub.safeParse(undefined)
        // A field that refuses `undefined` is required and has no blank. That
        // is a fact about the column, and `withGates` refuses to gate one.
        if (!absent.success) continue
        expect(
          sub.safeParse(absent.data).success,
          `${form}.${spec.name} [${spec.kind}] does not take its own blank back`,
        ).toBe(true)
      }
    }
  })

  /**
   * **The kinds a table would get wrong, named.** Each of these is a real
   * column shape in this tree, and `''` - the old answer for anything not
   * `checkbox`, `number` or `multi_device_select` - is refused by all of them.
   */
  it('answers null for a nullable reference, a nullable stamp and an optional count', () => {
    const cases = [
      ['device_select', z.uuid().nullable().default(null)],
      ['event_datetime', z.iso.datetime().nullable().default(null)],
      ['number', optionalCount()],
    ] as const
    for (const [name, sub] of cases) {
      expect(blankOf(sub), `${name} blank`).toBeNull()
    }
    // The two that refuse `''` outright - a table answering `''` for either
    // posts a value the column rejects.
    expect(z.uuid().nullable().default(null).safeParse('').success).toBe(false)
    expect(z.iso.datetime().nullable().default(null).safeParse('').success).toBe(false)
    // And the one that takes `''` and *stores* something else, which is the
    // subtler half: a seal to `0` would record a count the row never stated.
    expect(optionalCount().parse('')).toBeNull()
  })

  it('answers the declared default where there is one', () => {
    expect(blankOf(z.string().trim().max(80).default(''))).toBe('')
    expect(blankOf(z.boolean().default(false))).toBe(false)
    expect(blankOf(z.array(z.uuid()).default([]))).toEqual([])
  })

  /**
   * **A required field has no blank, so gating one is refused at declaration.**
   * Sealing it would post a value the column rejects, on a control the analyst
   * cannot see they filled - and the alternative, leaving it, posts the value
   * the gate says is meaningless.
   */
  it('refuses to gate a field that has no blank', () => {
    expect(() =>
      withGates(
        z.object({
          gate: field(z.enum(['open', 'shut']).default('shut'), { label: 'Gate', kind: 'select' }),
          needed: field(z.string().min(1), {
            label: 'Needed',
            kind: 'text',
            applicableWhen: { field: 'gate', oneOf: ['open'] },
            inapplicable: 'not here',
          }),
        }),
      ),
    ).toThrow(/needed/)
  })
})

/**
 * **What "empty" is, on both sides of the wire.**
 *
 * The generated refusal has to let an empty field through whatever its kind,
 * or a shut gate refuses a row the analyst has no way to save: there is no
 * value they can enter to clear a checkbox that is already unticked. And the
 * client seals a shut field to *its* idea of empty before posting, so the two
 * ideas have to be one - which is the same duplication the generated refusal
 * exists to remove, one layer down.
 */
describe('a generated refusal and an empty field', () => {
  const gated = (name: string, schema: z.ZodType, kind: FieldKind) =>
    field(schema, {
      label: name,
      kind,
      applicableWhen: { field: 'gate', oneOf: ['open'] },
      inapplicable: `no ${name} here`,
    })

  const probe = withGates(
    z.object({
      gate: field(z.enum(['open', 'shut']).default('shut'), {
        label: 'Gate',
        kind: 'select',
      }),
      flag: gated('flag', z.boolean().default(false), 'checkbox'),
      count: gated('count', z.number().default(0), 'number'),
      list: gated('list', z.array(z.uuid()).default([]), 'multi_device_select'),
      note: gated('note', z.string().trim().max(80).default(''), 'text'),
    }),
  )

  it('takes a row that sets nothing while every gate is shut', () => {
    // `.default()` materialises before the object-level refine, so `false` and
    // `0` arrive at the check as values. Reading them as *set* refuses a body
    // carrying nothing at all.
    const answer = probe.safeParse({})
    expect(
      answer.error?.issues.map((issue) => issue.path.join('.')),
      'a row that sets nothing is refused',
    ).toBeUndefined()
  })

  it('takes each field at the blank its own column holds', () => {
    for (const name of ['flag', 'count', 'list', 'note'] as const) {
      const answer = probe.safeParse({
        gate: 'shut',
        [name]: blankOf(probe.shape[name]),
      })
      expect(
        answer.error?.issues.map((issue) => issue.path.join('.')),
        `${name} sealed to its own blank is refused`,
      ).toBeUndefined()
    }
  })

  it('still refuses each kind when it holds something and the gate is shut', () => {
    const held: Record<string, unknown> = {
      flag: true,
      count: 3,
      list: ['00000000-0000-4000-8000-000000000000'],
      note: 'x',
    }
    for (const [name, value] of Object.entries(held)) {
      const answer = probe.safeParse({ gate: 'shut', [name]: value })
      expect(
        answer.error?.issues.map((issue) => issue.path.join('.')),
        `${name} holding a value behind a shut gate is accepted`,
      ).toContain(name)
    }
  })

  it('takes every one of them once the gate is open', () => {
    expect(
      probe.safeParse({
        gate: 'open',
        flag: true,
        count: 3,
        list: ['00000000-0000-4000-8000-000000000000'],
        note: 'x',
      }).success,
    ).toBe(true)
  })
})

describe('the same schema as a validator', () => {
  /**
   * **Re-anchored from the pair rule to the kind rule.** It held *neither an
   * IP nor a domain is refused*, which two columns needed; there is one
   * `value` now and its own `min(1)` answers that. What the schema still owes
   * is the rule two fields make together, and it is this one.
   */
  it('refuses a scope on something that is not an address', () => {
    const result = networkIndicatorSchema.safeParse({
      type: 'domain', value: 'example.test', scope: 'branch-a',
    })
    expect(result.success).toBe(false)
    // Pointed at a control rather than the object root, or the dialog has
    // nowhere to draw it.
    expect(result.error?.issues[0]?.path).toEqual(['scope'])
  })

  it('refuses an indicator with no value', () => {
    expect(networkIndicatorSchema.safeParse({ type: 'domain' }).success).toBe(false)
  })

  it('accepts a scope on either address kind, and none on the rest', () => {
    const scoped = (type: string) =>
      networkIndicatorSchema.safeParse({ type, value: '10.0.0.5', scope: 'branch-a' }).success
    expect(scoped('ipv4')).toBe(true)
    expect(scoped('ipv6')).toBe(true)
    expect(networkIndicatorSchema.safeParse({ type: 'url', value: 'x/y' }).success).toBe(true)
  })

  it('defaults an untriaged indicator rather than asserting a verdict', () => {
    const parsed = networkIndicatorSchema.parse({ type: 'ipv4', value: '198.51.100.7' })
    expect(parsed.disposition).toBe('unknown')
    expect(parsed.triage).toBe('untriaged')
  })
})

describe('the same schema as an OpenAPI document', () => {
  it('emits JSON Schema with the vocabulary inline', () => {
    const doc = z.toJSONSchema(shape) as { properties: Record<string, { enum?: string[] }> }
    expect(doc.properties.disposition?.enum).toEqual([...DISPOSITION])
    expect(doc.properties.triage?.enum).toEqual([...TRIAGE])
  })
})

/**
 * **The detection a cross-field rule's enforcement rests on.**
 * `CollectionService` reads a stored row before a patch only when
 * `hasCrossFieldRule` says the schema has one. If a Zod upgrade moves the
 * checks off `_zod.def.checks`, that function turns quietly false, every
 * collection skips the read, and the rule stops being enforced with no test
 * failing anywhere near it. These two fail instead.
 */
describe('finding a rule that spans two fields', () => {
  it('sees the one the network indicator carries', () => {
    expect(hasCrossFieldRule(networkIndicatorSchema)).toBe(true)
  })

  it('does not see one where there is none', () => {
    expect(hasCrossFieldRule(z.object({ a: z.string(), b: z.string() }))).toBe(false)
  })

  /**
   * The behaviour the whole mechanism exists for, asserted here rather than
   * only through the service: rebuilding from `.shape` loses the rule, which
   * is why the check cannot live on the patch schema.
   */
  it('is lost by rebuilding the object from its shape', () => {
    expect(hasCrossFieldRule(z.object(networkIndicatorSchema.shape))).toBe(false)
  })
})

describe('the vocabularies, after the 2026-08-09 revision', () => {
  it('offers critical, which the Python scale could not add', () => {
    // The most visible incoherence: every report leads with critical and the
    // old top rung was high. Blocked in Python by validate_case plus no
    // migration layer.
    expect(SEVERITY[0]).toBe('critical')
  })

  it('no longer offers soc, which was never a severity', () => {
    expect(SEVERITY).not.toContain('soc')
  })

  it('keeps suspicious, which is why an indicator carries no confidence', () => {
    // If this ever goes, confidence has to arrive in the same change - the two
    // designs are exclusive and mixing them makes "suspicious, high
    // confidence" expressible.
    expect(DISPOSITION).toContain('suspicious')
  })
})
