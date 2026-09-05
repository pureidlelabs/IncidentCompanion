/**
 * **A body the reference calls valid is not refused as invalid.**
 *
 * The write sweep next door sends a body nobody could mean and checks it is
 * refused. This is the other direction, and it is the one that catches a
 * document telling a caller something untrue: the reference publishes a shape,
 * a generated instance of that shape goes to the route, and the route must not
 * answer *"validation failed"*.
 *
 * **A refusal that is not about the shape is fine and expected.** A generated
 * uuid names no row, so 404 is right; a version of 1 may be stale, so 409 is
 * right; a name that is not a regime this install has is a 400. What is being
 * asserted is narrower than "the write works" - it is that the door and its own
 * description agree about what a body looks like, which is the defect neither
 * half can see alone because each is self-consistent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, seedDemoContent, operations, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

/** Routes whose body cannot be generated from its schema, with the reason. */
const NOT_GENERATED: ReadonlyArray<readonly [string, string]> = [
  ['/api/cases/import', 'Takes an archive. Bytes have no instance to generate.'],
  ['/api/cases/{caseId}/{collection}.csv', 'Takes a CSV, and the header decides the collection.'],
  ['/api/appearance/avatar', 'Takes an image.'],
]

interface Schema {
  type?: string
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  enum?: unknown[]
  /** 2020-12 spells a one-value literal `const`, where 3.0 spelt it `enum`. */
  const?: unknown
  anyOf?: Schema[]
  oneOf?: Schema[]
  allOf?: Schema[]
  format?: string
  /** Honoured, because a field with a minimum refuses a one-character string. */
  minLength?: number
  $ref?: string
}

/**
 * The smallest value this schema calls valid.
 *
 * **Required fields only.** An optional field left out is still a valid
 * instance, and filling everything would test the generator's imagination
 * rather than the door's agreement with its own document.
 */
function instanceOf(schema: Schema, doc: Record<string, unknown>, depth = 0): unknown {
  if (depth > 6) return null

  if (schema.$ref) {
    const name = schema.$ref.split('/').pop()
    const components = (doc.components ?? {}) as { schemas?: Record<string, Schema> }
    const target = name ? components.schemas?.[name] : undefined
    return target ? instanceOf(target, doc, depth + 1) : {}
  }
  if (schema.const !== undefined) return schema.const
  if (schema.enum?.length) return schema.enum[0]
  if (schema.anyOf?.length) return instanceOf(schema.anyOf[0]!, doc, depth + 1)
  if (schema.oneOf?.length) return instanceOf(schema.oneOf[0]!, doc, depth + 1)
  if (schema.allOf?.length) {
    return Object.assign({}, ...schema.allOf.map((one) => instanceOf(one, doc, depth + 1)))
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000000'
      if (schema.format === 'date-time') return new Date(0).toISOString()
      /**
       * **A format or a length the document states is part of what it
       * promises.** Sending `x` at a field the schema says is an email, or is
       * twelve characters long, produces a 422 that says the door and the
       * document disagree - when in fact only the generator did. Caught by
       * `POST /api/setup`, whose password has a minimum and whose username is
       * an address.
       */
      if (schema.format === 'email') return 'generated@example.invalid'
      if (typeof schema.minLength === 'number' && schema.minLength > 1) {
        return 'x'.repeat(schema.minLength)
      }
      return 'x'
    case 'number':
    case 'integer':
      return 1
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const key of schema.required ?? []) {
        const sub = schema.properties?.[key]
        if (sub) out[key] = instanceOf(sub, doc, depth + 1)
      }
      return out
    }
    default:
      return {}
  }
}

describe.skipIf(!runnable)('a body the reference calls valid', () => {
  let harness: Harness
  let admin: Persona
  let realCase: string

  beforeAll(async () => {
    harness = await boot()
    await seedDemoContent(harness)
    admin = await sharedAdmin(harness)
    const cases = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string }[]
    realCase = cases[0]!.id
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('is never refused as invalid by the route that published it', async () => {
    const doc = harness.document as unknown as Record<string, unknown>
    const paths = (doc.paths ?? {}) as Record<string, Record<string, unknown>>
    const lied: string[] = []
    let sent = 0

    for (const one of operations(harness.document)) {
      if (one.method === 'GET' || one.method === 'DELETE') continue
      if (NOT_GENERATED.some(([path]) => path === one.template)) continue

      const operation = paths[one.template]?.[one.method.toLowerCase()] as
        | { requestBody?: { content?: Record<string, { schema?: Schema }> } }
        | undefined
      const schema = operation?.requestBody?.content?.['application/json']?.schema
      if (!schema) continue

      const body = instanceOf(schema, doc)
      if (typeof body !== 'object' || body === null) continue
      sent++

      const path = one.path.replace('00000000-0000-4000-8000-000000000000', realCase)
      const response = await fetch(`${harness.base}${path}`, {
        method: one.method,
        headers: { cookie: admin.cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.status === 422) {
        const said = await response.text()
        // A 422 that is a *business* refusal is fine; one naming validation is
        // the document and the door disagreeing.
        if (said.includes('Validation failed')) {
          lied.push(`${one.method} ${one.template} -> ${said.slice(0, 160)}`)
        }
      }
    }

    expect(lied).toEqual([])
    // Guards against a run that generated nothing and asserted nothing.
    expect(sent).toBeGreaterThan(20)
  }, 180_000)

  it('has no skip naming a route that is gone', () => {
    const live = new Set(operations(harness.document).map((one) => one.template))
    expect(NOT_GENERATED.filter(([p]) => !live.has(p)).map(([p]) => p)).toEqual([])
  })
})
