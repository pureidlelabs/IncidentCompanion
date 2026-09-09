/**
 * The OpenAPI document, so the API is usable without the React client.
 *
 * Built from the Zod schemas the routes already validate with, so a schema is
 * the validator, the form metadata and the documented shape at once.
 *
 * **The document only; `docs.controller.ts` renders it.**
 * `SwaggerModule.setup()` is deliberately unused.
 */
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import type { INestApplication } from '@nestjs/common'

import {
  asDownload,
  asEmpty,
  asEnvelope,
  asUpload,
  describe,
  groupOf,
  humanise,
  PARAMETERS,
  refusals,
  resourceOf,
  summarise,
  type Operation,
} from './openapi.prose.js'

export function openApiDocument(app: INestApplication): OpenAPIObject {
  const spec = new DocumentBuilder()
    // Zod 4 emits JSON Schema 2020-12, which is 3.1's dialect and not 3.0's.
    .setOpenAPIVersion('3.1.0')
    .setTitle('IncidentCompanion')
    .setDescription(
      [
        'The API behind IncidentCompanion: cases and the tables each one holds, the',
        'reports written from them, and the compliance record kept alongside.',
        '',
        'To use it, sign in with `POST /api/auth/sign-in/email` and send the session',
        'cookie with every request after that. Four operations work without one:',
        '`GET /api/health`, this document, and the two `/api/setup` routes that',
        'claim an install with no accounts yet.',
        '',
        'Rows carry a `version` field. When you write, send the version you last read.',
        'If somebody else got there first the write is refused with a **409**, which',
        'tells you the version the row is on now so you can work out what changed.',
        '',
        'The stack answers on loopback over TLS. The certificate is generated on',
        'first start and is self-signed, so a client has to be told to accept it.',
      ].join('\n'),
    )
    .setVersion('internal-dev')
    .addCookieAuth('__Secure-better-auth.session_token')
    /**
     * **Registering the scheme above is not requiring it.** Without this every
     * operation carries no `security`, so a generated client sends no cookie
     * and 401s itself. Declared once at the document; the public routes clear
     * it with `@ApiSecurity({})`.
     */
    .addSecurityRequirements('cookie')
    .build()

  // `cleanupOpenApiDoc` is `nestjs-zod` 5's replacement for v4's
  // `patchNestJsSwagger()`, and skipping it ships schemas nothing validates
  // against.
  return tidy(cleanupOpenApiDoc(SwaggerModule.createDocument(app, spec)))
}

/**
 * The reference's own viewer, which is a page rather than an endpoint and sits
 * under `/api/` - so the prefix test below keeps it unless it is named here.
 */
const THE_VIEWER = (path: string): boolean => path === '/api/docs' || path.startsWith('/api/docs/')

const NOT_THE_API = (path: string): boolean =>
  !(path === '/api' || path.startsWith('/api/')) || THE_VIEWER(path)

/**
 * Rewrite every 3.0 `nullable: true` under `node`, in place, into 3.1's
 * `type: [..., 'null']`.
 *
 * `@nestjs/terminus`'s `@HealthCheck()` writes its schema by hand and spells
 * nullability the old way, which 3.1 has no property for at all.
 */
function withoutNullable(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(withoutNullable)
    return
  }
  if (node === null || typeof node !== 'object') return

  const schema = node as Record<string, unknown>
  if (schema['nullable'] === true) {
    delete schema['nullable']
    const type: unknown = schema['type']
    if (typeof type === 'string') schema['type'] = [type, 'null']
    else if (Array.isArray(type) && !type.includes('null')) {
      schema['type'] = [...(type as unknown[]), 'null']
    }
  }
  Object.values(schema).forEach(withoutNullable)
}

/**
 * Rewrite every `prefixItems` under `node`, in place, into `items` with a
 * fixed length. Per-position descriptions are joined onto the array's own.
 */
function withoutTuples(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(withoutTuples)
    return
  }
  if (node === null || typeof node !== 'object') return

  const schema = node as Record<string, unknown>
  const positions = schema['prefixItems']
  if (Array.isArray(positions) && positions.length > 0) {
    const entries = positions as Record<string, unknown>[]
    const said = entries
      .map((one) => one['description'])
      .filter((one): one is string => typeof one === 'string')

    const types = [...new Set(entries.map((one) => one['type']).filter(Boolean))]

    delete schema['prefixItems']
    // Open, not `anyOf: []`, which nothing can satisfy.
    if (types.length === 0) schema['items'] = {}
    else if (types.length === 1) schema['items'] = { type: types[0] }
    else schema['items'] = { anyOf: types.map((type) => ({ type })) }
    schema['minItems'] = entries.length
    schema['maxItems'] = entries.length
    if (said.length > 0) {
      schema['description'] = [schema['description'], ...said]
        .filter((one): one is string => typeof one === 'string' && one !== '')
        .join(' ')
    }
  }

  for (const value of Object.values(schema)) withoutTuples(value)
}

/**
 * Rewrites the generated document in place: drops the paths that are pages,
 * renames every tag and summary, nests the tags under headings, attaches the
 * bodies and refusals each operation can answer with, and lowers the schema
 * keywords the declared version does not have.
 *
 * **Everything here is derived from the path and from `COLLECTION_SCHEMAS`**,
 * never from a hand-kept map of controller to display name - a collection added
 * tomorrow is documented without touching this file.
 */
export function tidy(document: OpenAPIObject): OpenAPIObject {
  const paths: OpenAPIObject['paths'] = {}
  const tags = new Set<string>()
  /** Heading -> the resource tags under it, for `x-tagGroups`. */
  const grouped = new Map<string, Set<string>>()

  withoutTuples(document.components)
  withoutNullable(document)

  for (const path of Object.keys(document.paths).sort()) {
    if (NOT_THE_API(path)) continue
    const operations = document.paths[path]!
    const resource = resourceOf(path)

    for (const [method, operation] of Object.entries(operations)) {
      if (!operation || typeof operation !== 'object') continue
      const one = operation as Operation

      // The tag is the resource; the heading it sits under is `x-tagGroups`,
      // which Redoc renders as a second level.
      const tag = humanise(resource ?? 'API')
      one.tags = [tag]
      tags.add(tag)
      const group = groupOf(path) ?? tag
      grouped.set(group, (grouped.get(group) ?? new Set()).add(tag))

      one.summary ??= summarise(method, path, resource)
      for (const parameter of one.parameters ?? []) {
        const said = parameter.name ? PARAMETERS[parameter.name] : undefined
        if (said) parameter.description ??= said
      }
      // Three response passes, and only one may claim an operation: a download
      // answers with bytes and an install document is not a table.
      asUpload(one, method, path)

      if (
        !asDownload(one, method, path) &&
        !asEnvelope(one, method, path) &&
        !asEmpty(one, method, path)
      ) {
        describe(one, method, path, resource)
      }

      /**
       * Attached last, so a body added just above is seen and answered with
       * the 400 that goes with it - and **outside every pass above**, because
       * a route reaching this by only one branch loses its 401 and 500 as an
       * absence rather than a failure. Held by `openapi.test.ts`.
       */
      one.responses = { ...refusals(method, path, Boolean(one.requestBody)), ...one.responses }
    }
    paths[path] = operations
  }

  /**
   * **Ordered as the API is used, not alphabetically.** A reader arrives
   * wanting a case, then its data, then a report out of it; sorting put
   * "Accounts and access" first and "This install" in the middle. Anything
   * that fell back to its own resource name follows, sorted, so a new route is
   * visible without being promoted above the eight.
   */
  const ORDER = [
    'Cases',
    'Case data',
    'Reports',
    'Compliance',
    'Archive',
    'Library',
    'Accounts and access',
    'This install',
  ]
  const headings = [
    ...ORDER.filter((name) => grouped.has(name)),
    ...[...grouped.keys()].filter((name) => !ORDER.includes(name)).sort(),
  ]

  /**
   * **A tag may belong to exactly one heading.** Redoc renders a tag under
   * *every* group that lists it, so a name in two draws every operation under
   * it twice. Qualified mechanically rather than by a table of exceptions, so a
   * collision introduced later is disambiguated rather than duplicated.
   */
  const owners = new Map<string, Set<string>>()
  for (const [group, members] of grouped) {
    for (const tag of members) owners.set(tag, (owners.get(tag) ?? new Set()).add(group))
  }
  const qualify = (group: string, tag: string): string =>
    (owners.get(tag)?.size ?? 0) > 1 ? `${tag} (${group.toLowerCase()})` : tag

  // Rewritten from the paths, so each operation is qualified by the group it
  // actually sits in rather than by whichever one is being iterated.
  for (const [path, operations] of Object.entries(paths)) {
    const group = groupOf(path)
    if (!group) continue
    for (const operation of Object.values(operations ?? {})) {
      const one = operation as Operation
      const tag = one.tags?.[0]
      if (tag) one.tags = [qualify(group, tag)]
    }
  }
  for (const [group, members] of grouped) {
    grouped.set(group, new Set([...members].map((tag) => qualify(group, tag))))
  }
  tags.clear()
  for (const members of grouped.values()) for (const tag of members) tags.add(tag)

  return {
    ...document,
    /**
     * **The mark, above the contents page.** `x-logo` is Redoc's, and the URL
     * is relative for the reason every other URL on that page is: the port is
     * not knowable at build time, and a taken one silently becomes the next
     * free one. -> `brand.controller.ts` for what `/wordmark.png` serves.
     */
    info: {
      ...document.info,
      'x-logo': { url: '/wordmark.png', altText: 'IncidentCompanion', href: '/' },
      license: { name: 'GNU AGPL v3.0', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
    },
    // Relative: the address is whatever this install was published on.
    servers: [{ url: '/' }],
    paths,
    tags: [...tags].sort().map((name) => ({ name })),
    // A group takes name and tags; a description here renders nowhere.
    'x-tagGroups': headings.map((name) => ({
      name,
      tags: [...(grouped.get(name) ?? [])].sort(),
    })),
  } as OpenAPIObject
}
