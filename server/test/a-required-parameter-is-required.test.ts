/**
 * **A query parameter the document calls required is one the route refuses to
 * work without, and one it calls optional is one the route works without.**
 *
 * The write sweep next door checks that a body the reference calls valid is
 * accepted. This is the same question asked of the other half of a request:
 * `@nestjs/swagger` builds a parameter from every `@Query('name')` and marks it
 * required, because the `?` that makes it optional is on the handler's own
 * parameter and nothing carries that to runtime -- so the signature and the
 * document said opposite things, with no tier reading both.
 *
 * **Asked per parameter, not per route.** A route with one required and one
 * optional parameter, asked once with both left out, is refused for the first
 * and says nothing about the second. So each parameter is left out of a query
 * carrying the route's *required* ones, which is the smallest request that
 * isolates it.
 *
 * **Only a 422 or a 400 is about the query.** A stand-in id names no row, so a
 * 404 or a 403 is the route answering about the row. What cannot happen is a
 * required parameter left out and a 200 returned, or an optional one left out
 * and the query refused.
 *
 * **GET alone**, because a write left out of this sweep is a write performed:
 * the point of a request here is the answer's status, and the reads are where
 * that can be asked without changing the install.
 *
 * **What this does not cover:** a value a parameter will not accept, which is
 * `an-export-reads-its-own-query.test.ts`, and a parameter that is not
 * published at all -- an undocumented parameter is a description that is short
 * rather than untrue, and nothing in a document can point at one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, seedDemoContent, operations, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

const STAND_IN = '00000000-0000-4000-8000-000000000000'

interface Parameter {
  name: string
  in: string
  required?: boolean
  // A query travels as text, so what a parameter defaults to is a scalar or it
  // is not something this can send.
  schema?: { default?: string | number | boolean; enum?: unknown[]; type?: string }
}

/**
 * A value this parameter says it takes.
 *
 * Its own default first, then the first value of its enum, then a string --
 * anything else would be the sweep inventing a value the document does not
 * promise is acceptable.
 */
function valueFor(parameter: Parameter): string {
  const schema = parameter.schema ?? {}
  if (schema.default !== undefined) return String(schema.default)
  if (schema.enum?.length) return String(schema.enum[0])
  return schema.type === 'integer' || schema.type === 'number' ? '1' : STAND_IN
}

describe.skipIf(!runnable)('a query parameter the document publishes', () => {
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

  it('is required exactly where the route treats it as required', async () => {
    const doc = harness.document as unknown as Record<string, unknown>
    const paths = (doc.paths ?? {}) as Record<string, Record<string, unknown>>
    const lied: string[] = []
    /** Asks that produced an answer about the row rather than about the query. */
    let served = 0

    for (const one of operations(harness.document)) {
      if (one.method !== 'GET') continue

      const operation = paths[one.template]?.[one.method.toLowerCase()] as
        | { parameters?: Parameter[] }
        | undefined
      const query = (operation?.parameters ?? []).filter((parameter) => parameter.in === 'query')
      if (query.length === 0) continue

      const demanded = query.filter((parameter) => parameter.required === true)
      // Every stand-in, not the first: `replace` takes one occurrence, so a
      // path naming a case *and* a report kept the second and 404'd on it.
      const path = one.path.replaceAll(STAND_IN, realCase)

      for (const parameter of query) {
        // The smallest query that isolates this one: what the route demands,
        // less this parameter.
        const sent = demanded
          .filter((other) => other.name !== parameter.name)
          .map((other) => `${other.name}=${encodeURIComponent(valueFor(other))}`)
        const asked = `${path}${sent.length > 0 ? `?${sent.join('&')}` : ''}`
        const response = await fetch(`${harness.base}${asked}`, {
          headers: { cookie: admin.cookie },
        })
        const aboutTheQuery = response.status === 422 || response.status === 400

        if (parameter.required === true) {
          if (response.status === 200) {
            lied.push(`GET ${one.template} -> 200 without ${parameter.name}, which it demands`)
          } else if (aboutTheQuery) {
            /**
             * **Refused, but for this?** A status alone lets another rule's
             * refusal stand in for the one being asked about, so the required
             * arm would read as confirmed on a route that never noticed the
             * parameter was missing.
             */
            const said = (await response.json()) as { errors?: { path?: unknown[] }[] }
            const blamed = said.errors?.flatMap((issue) => issue.path ?? []) ?? []
            if (!blamed.includes(parameter.name)) {
              lied.push(
                `GET ${one.template} -> refused without ${parameter.name} and named ` +
                  `${blamed.length > 0 ? blamed.join(', ') : 'nothing'} instead`,
              )
            }
          }
        }
        if (parameter.required !== true && aboutTheQuery) {
          lied.push(
            `GET ${one.template} -> ${String(response.status)} without ${parameter.name}, ` +
              'which it calls optional',
          )
        }
        if (response.status === 200) served++
      }
    }

    expect(lied).toEqual([])
    /**
     * **Counts answers, not asks.** A sweep whose every request 404'd on a
     * stand-in would satisfy both assertions above having exercised nothing,
     * and that is the shape this file failed in once: one route's second
     * stand-in was never replaced.
     */
    expect(served).toBeGreaterThan(5)
  }, 180_000)

  /**
   * **The parameter that decides the media type is published.** The indicators
   * export serves CSV by default and a STIX bundle on `?format=stix`; the
   * document listed neither the parameter nor the second content type, so a
   * caller reading it cannot reach the bundle at all -- and `tlp`, the one
   * parameter it *was* told to send, is refused unless the format it was not
   * told about is the one asked for.
   */
  it('names the parameter that changes what the indicators export answers with', () => {
    const paths = (harness.document as unknown as {
      paths: Record<string, Record<string, { parameters?: Parameter[]; responses?: Record<string, { content?: Record<string, unknown> }> }>>
    }).paths
    const operation = paths['/api/cases/{caseId}/indicators']?.['get']
    const named = (operation?.parameters ?? []).map((one) => one.name)
    const format = (operation?.parameters ?? []).find((one) => one.name === 'format')

    expect(named).toContain('format')
    // The default is published, so a caller can see what saying nothing gets
    // them, and it comes from the schema the handler reads rather than a second
    // copy written here.
    expect(format?.schema?.default).toBe('csv')
    expect(Object.keys(operation?.responses?.['200']?.content ?? {}).sort()).toEqual([
      'application/json',
      'text/csv',
    ])
  })

  /**
   * The parameters the activity feed takes were published nowhere: it binds the
   * whole query at once, which `@nestjs/swagger` builds no parameter from at
   * all. They arrive with the schema that refuses them.
   */
  it('names every parameter a route reads its whole query for', () => {
    const paths = (harness.document as unknown as {
      paths: Record<string, Record<string, { parameters?: Parameter[] }>>
    }).paths
    const named = (paths['/api/install/activity']?.['get']?.parameters ?? [])
      .filter((one) => one.in === 'query')
      .map((one) => one.name)
      .sort()

    expect(named).toEqual(['after', 'channel', 'limit', 'minSeverity', 'outcome', 'since'])
  })
})
