/**
 * A version no reader could have read is refused at 422, naming the version,
 * at every door the served document says takes one: past the int4 column it is
 * checked against, below its floor, not whole, not a number, or absent. -> #707
 *
 * The doors are the document's own: a `version` query parameter, or a
 * `version` property anywhere in a JSON body, `ids[].version` and
 * `targets[].rows[].version` included. A PATCH on a record whose read publishes
 * a version has to be one of them. DELETE is not held to that rule.
 */
import type { OpenAPIObject } from '@nestjs/swagger'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, operations, sharedAdmin, type Harness, type Persona } from './app-harness.js'

/** Past what the int4 column holds, as the JSON number a body carries. */
const PAST_THE_COLUMN = 3_000_000_000

/**
 * Versions no reader produced. Each query spelling is a number to `Number` and
 * to nothing else; `undefined` leaves the version out.
 */
const NOT_A_VERSION = {
  query: ['abc', '-1', '1.5', '9999999999999', '', ' 1', '1e3', '0x10', String(PAST_THE_COLUMN), undefined],
  body: [PAST_THE_COLUMN, -1, 1.5, '3', null, undefined],
}
const NOWHERE = '00000000-0000-4000-8000-000000000000'

type Schema = Record<string, unknown>
type Operation = {
  parameters?: { name: string; in: string }[]
  requestBody?: { content?: Record<string, { schema?: Schema }> }
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>
}

function resolved(document: OpenAPIObject, schema: unknown): Schema {
  let at = (schema ?? {}) as Schema
  while (typeof at['$ref'] === 'string') {
    at = (document.components?.schemas?.[at['$ref'].split('/').pop()!] ?? {}) as Schema
  }
  return at
}

const branches = (schema: Schema): Schema[] =>
  (['oneOf', 'anyOf', 'allOf'] as const).flatMap((key) => (schema[key] as Schema[] | undefined) ?? [])

/** Every route from a body's root to a `version`, with `[]` for an array's item. */
function versionPaths(document: OpenAPIObject, schema: unknown, depth = 0): string[][] {
  const at = resolved(document, schema)
  if (depth > 8) return []
  const found = branches(at).flatMap((branch) => versionPaths(document, branch, depth + 1))
  for (const [name, property] of Object.entries((at['properties'] ?? {}) as Record<string, Schema>)) {
    if (name === 'version') found.push([name])
    for (const rest of versionPaths(document, property, depth + 1)) found.push([name, ...rest])
  }
  if (at['items']) {
    for (const rest of versionPaths(document, at['items'], depth + 1)) found.push(['[]', ...rest])
  }
  return found.filter((path, i) => found.findIndex((one) => one.join('.') === path.join('.')) === i)
}

/** The smallest value `schema` names, for a field the version rides beside. */
function least(document: OpenAPIObject, schema: unknown): unknown {
  const at = resolved(document, schema)
  const [first] = branches(at)
  if (first) return least(document, first)
  if (Array.isArray(at['enum'])) return at['enum'][0]
  if ('const' in at) return at['const']
  const type = [at['type']].flat().find((one) => one !== 'null')
  if (type === 'string') return at['format'] === 'uuid' ? NOWHERE : 'x'.repeat(Number(at['minLength'] ?? 1))
  if (type === 'integer' || type === 'number') return Number(at['minimum'] ?? 0)
  if (type === 'boolean') return false
  if (type === 'array') return []
  if (type === 'object') return withRequired(document, at, {})
  return null
}

function withRequired(document: OpenAPIObject, schema: Schema, into: Record<string, unknown>) {
  const properties = (schema['properties'] ?? {}) as Record<string, Schema>
  for (const name of (schema['required'] ?? []) as string[]) {
    if (!(name in into)) into[name] = least(document, properties[name])
  }
  return into
}

/** A body `schema` accepts in everything but `version` at `path`. */
function bodyWith(document: OpenAPIObject, schema: unknown, path: string[], version: unknown): unknown {
  const at = resolved(document, schema)
  if (path.length === 0) return version
  const carrying = branches(at).find((branch) =>
    versionPaths(document, branch).some((one) => one.join('.') === path.join('.')),
  )
  if (carrying) return bodyWith(document, carrying, path, version)
  const [head, ...rest] = path
  if (head === '[]') return [bodyWith(document, at['items'], rest, version)]
  const properties = (at['properties'] ?? {}) as Record<string, Schema>
  return withRequired(document, at, { [head!]: bodyWith(document, properties[head!], rest, version) })
}

/** One field `schema` lets a patch change, or nothing when none is plain enough to fill. */
function oneChange(document: OpenAPIObject, schema: unknown): Record<string, unknown> | undefined {
  const at = resolved(document, schema)
  const [first] = branches(at)
  if (first) return oneChange(document, first)
  for (const [name, property] of Object.entries((at['properties'] ?? {}) as Record<string, Schema>)) {
    const field = resolved(document, property)
    const type = [field['type']].flat()
    if (type.includes('boolean')) return { [name]: true }
    if (type.includes('string') && !field['format'] && !field['pattern'] && !field['enum'] && name !== 'version') {
      return { [name]: 'x'.repeat(Number(field['minLength'] ?? 1)) }
    }
  }
  return undefined
}

const jsonBody = (operation: Operation): Schema | undefined =>
  operation.requestBody?.content?.['application/json']?.schema

/** Whether the record `GET template` answers with publishes a version. */
function publishesVersion(document: OpenAPIObject, template: string): boolean {
  const read = (document.paths?.[template] as Record<string, Operation> | undefined)?.['get']
  const answer = read?.responses?.['200']?.content?.['application/json']?.schema
  return answer !== undefined && versionPaths(document, answer).some((path) => path.length === 1)
}

describe.skipIf(!(await bootable()))('every door that takes a version refuses one past its column', () => {
  let harness: Harness
  let admin: Persona
  let caseId = ''

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    const opened = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: `version doors ${String(Date.now())}` }),
    })
    const body = await opened.text()
    expect(opened.status, body).toBe(201)
    caseId = (JSON.parse(body) as { id: string }).id
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  /** Each door, and each place in it a version goes. */
  function doors() {
    return operations(harness.document, { caseId })
      .filter((one) => one.method !== 'GET')
      .flatMap((one) => {
        const operation = (harness.document.paths?.[one.template] as Record<string, Operation>)[
          one.method.toLowerCase()
        ]!
        const inQuery = (operation.parameters ?? []).some((p) => p.in === 'query' && p.name === 'version')
        const body = jsonBody(operation)
        return [
          ...(inQuery ? [{ ...one, operation, where: ['?version'] }] : []),
          ...(body ? versionPaths(harness.document, body) : []).map((where) => ({ ...one, operation, where })),
        ]
      })
  }

  it('names where the version goes on every PATCH of a record that publishes one', () => {
    const named = new Set(doors().map((door) => `${door.method} ${door.template}`))
    const unnamed = operations(harness.document)
      .filter((one) => one.method === 'PATCH')
      .filter((one) => publishesVersion(harness.document, one.template.replace(/\/bulk$/, '/{id}')))
      .map((one) => `${one.method} ${one.template}`)
      .filter((one) => !named.has(one))

    expect(unnamed, 'these write a versioned record and publish nowhere to present the version').toEqual([])
  })

  it('refuses a version no reader could have read at 422, naming it, at each of them', async () => {
    const found = doors()
    expect(found.length, 'no door takes a version, so this sweeps nothing').toBeGreaterThan(0)

    const wrong: string[] = []
    for (const door of found) {
      const inQuery = door.where[0] === '?version'
      for (const version of inQuery ? NOT_A_VERSION.query : NOT_A_VERSION.body) {
        const query = inQuery && version !== undefined ? `?version=${encodeURIComponent(String(version))}` : ''
        const response = await fetch(`${harness.base}${door.path}${query}`, {
          method: door.method,
          headers: { cookie: admin.cookie, 'content-type': 'application/json' },
          body: inQuery
            ? undefined
            : JSON.stringify(bodyWith(harness.document, jsonBody(door.operation), door.where, version)),
        })
        const text = await response.text()
        if (response.status !== 422 || !/version/i.test(text)) {
          wrong.push(
            `${door.method} ${door.template} [${door.where.join('.')} = ${JSON.stringify(version)}]: ` +
              `${String(response.status)} ${text.slice(0, 160)}`,
          )
        }
      }
    }

    expect(wrong, 'a version no reader produced reached further than the door').toEqual([])
  }, 180_000)

  /** `currentVersion: null` is a row this case cannot see, and a 409 would send a client to merge against it. */
  it('answers 404 for a row this case does not hold, at every row PATCH, rather than a conflict', async () => {
    const rows = doors().filter((door) => door.method === 'PATCH' && door.template.endsWith('/{id}'))
    expect(rows.length, 'no row PATCH takes a version, so this sweeps nothing').toBeGreaterThan(0)

    const wrong: string[] = []
    for (const door of rows) {
      const change = oneChange(harness.document, jsonBody(door.operation))
      if (!change) {
        wrong.push(`${door.template}: publishes no field this sweep can fill`)
        continue
      }
      const response = await fetch(`${harness.base}${door.path}`, {
        method: 'PATCH',
        headers: { cookie: admin.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ ...change, version: 1 }),
      })
      if (response.status !== 404) {
        wrong.push(`${door.template}: ${String(response.status)} ${(await response.text()).slice(0, 160)}`)
      }
    }

    expect(wrong).toEqual([])
  }, 120_000)
})
