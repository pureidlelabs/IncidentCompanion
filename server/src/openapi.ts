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
import { Logger, type INestApplication } from '@nestjs/common'
import { z } from 'zod'

import { COLLECTION_SCHEMAS } from './domain/collections.js'
import { fields, patchSchema } from './domain/field-spec.js'
import { reportBlockSchema, reportSchema } from './domain/entities/report.js'
import { caseSchema } from './cases/cases.dto.js'
import { timelineWriteSchema } from './domain/entities/timeline.js'

/**
 * The document, or `undefined` - **never a throw into bootstrap.** The document
 * is built during startup, so an unpublishable schema would otherwise stop the
 * server over its own documentation. `openapi.test.ts` keeps the schemas
 * publishable; this is what makes that test's failure a 404 rather than an
 * outage.
 */
export function tryOpenApiDocument(app: INestApplication, log: Logger): OpenAPIObject | undefined {
  try {
    return openApiDocument(app)
  } catch (error) {
    log.warn(`the OpenAPI document could not be built: ${String(error)}`)
    return undefined
  }
}

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
 * `BulkDelete` -> `Bulk delete`, `network_indicators` -> `Network indicators`.
 *
 * **Both spellings, because the two sources differ.** A tag arrives as a
 * controller class name in camel case; a resource arrives as a path segment in
 * snake case, and `casenotes` has neither separator - which is why the map
 * below exists for the handful that cannot be split mechanically.
 */
export function humanise(name: string): string {
  // A spelt-out name is used verbatim: it is the only way to keep an acronym's
  // capitals, since the mechanical path lowercases everything after the first
  // letter.
  const spelt = SPELT[name]
  if (spelt) return spelt
  const words = name
    .replace(/Controller$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/**
 * The path segments no rule can split, because they carry no separator.
 *
 * **Each entry is a spelling rather than a name.** This is not the enumeration
 * `CLAUDE.md` forbids: nothing here decides what exists, a missing entry costs
 * a capital letter rather than a broken route, and a new collection appears in
 * the document either way.
 */
const SPELT: Readonly<Record<string, string>> = {
  casenotes: 'Case notes',
  openapi: 'OpenAPI',
  csv: 'CSV export',
  /**
   * **`report` folds into `Reports`.** `report.docx`, `report.md` and
   * `report.pdf` are exports *of* a report, and left mechanical they made a
   * second group beside `reports` describing the same subject.
   */
  report: 'Reports',
}

/**
 * The resource a path is about, which is what a summary is written about.
 *
 * **The path, not the controller class.** `EvidenceFileController` and the
 * generic evidence routes are one subject and were two groups; `Spa` and
 * `Docs` were groups at all. A case-scoped path names its collection after the
 * case id, and everything else names it first.
 */
export function resourceOf(path: string): string | undefined {
  const scoped = /^\/api\/cases\/\{[^}]+\}\/([A-Za-z_.-]+)/.exec(path)
  if (scoped) return scoped[1]!.replace(/\..*$/, '')

  // A case-scoped segment that is itself a parameter takes its extension:
  // `/api/cases/{caseId}/{collection}.csv` exports whichever table is named.
  const byExtension = /^\/api\/cases\/\{[^}]+\}\/\{[^}]+\}\.([A-Za-z]+)/.exec(path)
  if (byExtension) return byExtension[1]!

  // A literal segment under `/api/cases` is its own subject - `/api/cases/import`
  // is an archive import, not a case. A parameter segment is not, so
  // `/api/cases/{id}` still reads `cases`.
  const under = /^\/api\/cases\/([A-Za-z_-][A-Za-z_.-]*)/.exec(path)
  if (under) return under[1]!.replace(/\..*$/, '')

  const top = /^\/api\/([A-Za-z_.-]+)/.exec(path)
  return top?.[1]?.replace(/\..*$/, '')
}

/**
 * The eight headings this API's operations are filed under.
 *
 * **First match wins, so the order is the specificity**: a case-scoped subject
 * has to be claimed before the catch-all `/cases/{id}/` rule reaches it.
 * Anything unmatched falls back to its resource, so a route added tomorrow
 * appears under its own name rather than vanishing.
 */
const GROUPS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/api\/cases\/\{[^}]+\}\/(reports?|report_blocks)\b/, 'Reports'],
  [/^\/api\/report-(block-kinds|layouts|snippets)/, 'Reports'],
  [/^\/api\/cases\/\{[^}]+\}\/compliance/, 'Compliance'],
  [/^\/api\/regimes/, 'Compliance'],
  [/^\/api\/cases\/\{[^}]+\}\/archive/, 'Archive'],
  [/^\/api\/cases\/import/, 'Archive'],
  [/^\/api\/cases\/\{[^}]+\}\//, 'Case data'],
  [/^\/api\/(cases|demos|recent-cases)/, 'Cases'],
  [/^\/api\/(library|collections|specs)/, 'Library'],
  [/^\/api\/(accounts|appearance|change-password|preferences)/, 'Accounts and access'],
  [/^\/api\/(about|settings|health|openapi)/, 'This install'],
]

/** The heading a path is filed under: the first rule that matches, or its own resource. */
export function groupOf(path: string): string | undefined {
  for (const [pattern, name] of GROUPS) if (pattern.test(path)) return name
  const resource = resourceOf(path)
  return resource ? humanise(resource) : undefined
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

interface Operation {
  tags?: string[]
  summary?: string
  description?: string
  requestBody?: unknown
  responses?: Record<string, unknown>
  parameters?: { name?: string; description?: string; in?: string }[]
}

/**
 * What each path and query parameter means, keyed by name. A parameter with no
 * entry keeps whatever the route declared.
 */
const PARAMETERS: Readonly<Record<string, string>> = {
  caseId: 'The case that owns the row.',
  id: 'The row, as returned by the list.',
  version:
    'The version the row carried when it was read. If it has moved since, the write is ' +
    'refused with 409 and the version it reached.',
  collection: 'Which table, spelled as it appears in the path.',
  slug: 'Which library \u2014 `templates`, `snippets`, or another the install has.',
  name: 'The entry, by the filename it was dropped in as.',
  username: 'The analyst, by the email they sign in with.',
  userId: 'The analyst, by account id.',
}

/**
 * The trailing segments that are commands rather than things.
 *
 * **Only the verbs need listing.** A noun gets the method's verb in front of
 * it; a verb already is the label, and `Add the send` would be nonsense. A
 * segment nobody classified is treated as a noun - wordy rather than wrong.
 */
const ACTIONS = new Set([
  'import',
  'send',
  'supersede',
  'resolve',
  'disable',
  'enable',
  'reset',
  'restore-sections',
  'bulk-delete',
])

/**
 * The singular of a collection name, for `Create a system`. Only the ones
 * stripping an `s` gets wrong: `malware`, `impact` and `evidence` are
 * uncountable and `casenotes` has no separator to split on.
 */
const SINGULAR: Readonly<Record<string, string>> = {
  malware: 'malware entry',
  impact: 'impact entry',
  evidence: 'evidence item',
  casenotes: 'case note',
  compliance: 'compliance record',
  attribution: 'attribution entry',
}

function singular(resource: string): string {
  const named = SINGULAR[resource]
  if (named) return named
  const words = humanise(resource).toLowerCase()
  return words.endsWith('s') ? words.slice(0, -1) : words
}

/**
 * What an operation is called: imperative and resource-first, as Microsoft
 * Graph and Elastic both write it - `List systems`, `Create a system`.
 *
 * Derived from the shape of the path, so a collection added tomorrow reads
 * correctly without an entry anywhere. Falls back to `METHOD /path` only when
 * the path names no resource. `openapi.test.ts` holds the labels distinct
 * within a heading.
 */
export function summarise(method: string, path: string, resource?: string): string {
  if (!resource) return `${method.toUpperCase()} ${path}`
  const many = humanise(resource).toLowerCase()
  const one = singular(resource)
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? ''
  const bulk = last === 'bulk'

  // A named action gets its own name; without this every path ending in
  // something other than the collection or a row id falls through to the plain
  // verb and several operations share one label.
  if (!bulk && !last.startsWith('{') && last !== resource) {
    // A verb stands alone; a noun takes the method's verb in front of it, or
    // three methods on `/appearance/avatar` are all labelled "Avatar".
    if (ACTIONS.has(last)) return humanise(last)
    const verb = { get: 'Get', post: 'Add', put: 'Replace', patch: 'Update', delete: 'Delete' }[
      method
    ]
    return verb ? `${verb} the ${humanise(last).toLowerCase()}` : humanise(last)
  }

  // A literal segment directly under `/api/cases` is an action on a case:
  // `resourceOf` reads it as the subject to keep the tag off "Cases", which
  // leaves the plain verb saying "Create an import".
  if (/^\/api\/cases\/[A-Za-z_-][A-Za-z_.-]*$/.test(path)) {
    return `${humanise(resource)} a case`
  }

  const row = !bulk && !path.endsWith(`/${resource}`)
  if (method === 'get') return row ? `Get ${article(one)}` : `List ${many}`
  if (method === 'post') return bulk ? `Create ${many} in bulk` : `Create ${article(one)}`
  if (method === 'patch') return bulk ? `Update ${many} in bulk` : `Update ${article(one)}`
  if (method === 'delete') return bulk ? `Delete ${many} in bulk` : `Delete ${article(one)}`
  return `${method.toUpperCase()} ${path}`
}

const article = (word: string): string => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`

/**
 * A schema as JSON Schema, described from the app's own field metadata.
 *
 * **The descriptions are not written here.** Each property's `description`
 * comes through Zod 4's `override` hook from the `label` that `field()`
 * already carries for the forms, so nothing describes a field twice.
 *
 * **The dialect the document declares.** 3.1 is JSON Schema 2020-12, where a
 * nullable field is `anyOf: [..., {type: 'null'}]` rather than 3.0's
 * `nullable: true`.
 */
export function published(schema: z.ZodType): Record<string, unknown> {
  // Safe by construction: `openapi.test.ts` runs this over every registered
  // collection, so an unpublishable field is a red test rather than a throw
  // out of bootstrap.
  return z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    override: ({ zodSchema, jsonSchema }) => {
      const meta = fields.get(zodSchema as never)
      if (!meta) return
      const said = meta.section?.copy ? `${meta.label}. ${meta.section.copy}` : meta.label
      if (said) jsonSchema.description ??= said
    },
  })
}

/**
 * Every schema the document can publish a shape from, keyed by path segment.
 *
 * **`COLLECTION_SCHEMAS` is not all of them** - it holds the entity tables an
 * import may write, while a report, its blocks and the case row are just as
 * much collections on the wire and live elsewhere.
 */
const PUBLISHABLE: Readonly<Record<string, z.ZodType>> = {
  ...COLLECTION_SCHEMAS,
  reports: reportSchema,
  report_blocks: reportBlockSchema,
  cases: caseSchema,
  // A discriminated union: an entry is an event or an action, so it cannot be
  // a `createZodDto` class (TS2509) and has to be named here to be published
  // at all. `toJSONSchema` renders it as `oneOf`.
  timeline: timelineWriteSchema,
}

/** The partial form, for the routes whose schema is an object. A union has none. */
function patchFormOf(schema: z.ZodType): z.ZodType | undefined {
  return schema instanceof z.ZodObject ? patchSchema(schema) : undefined
}

function schemaFor(resource: string | undefined): Record<string, unknown> | undefined {
  const schema = resource ? PUBLISHABLE[resource] : undefined
  return schema ? published(schema) : undefined
}

const json = (schema: unknown) => ({ content: { 'application/json': { schema } } })

/**
 * The routes that answer with a file: pattern, media type, description, and
 * the method when it is not `get`.
 *
 * **Read off the handlers rather than guessed** - documenting one of these as
 * `application/json` is worse than leaving it bare, because a generator then
 * builds a client that parses a Word document as JSON. `format: 'binary'` is
 * how OpenAPI 3.0 spells "bytes"; without it a generator types a PDF a string.
 */
const DOWNLOADS: ReadonlyArray<readonly [RegExp, string, string, string?]> = [
  [/\/report\.md$/, 'text/markdown', 'The report as Markdown.'],
  [/\/report\.pdf$/, 'application/pdf', 'The report as a PDF.'],
  [
    /\/report\.docx$/,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'The report as a Word document.',
  ],
  [/\.csv$/, 'text/csv', 'The rows of that table, one per line.'],
  [/\/avatar$/, 'image/png', 'The analyst\u2019s picture. PNG, JPEG or WebP.'],
  [/\/evidence\/\{[^}]+\}\/file$/, 'application/octet-stream', 'The stored bytes.'],
  // Two formats behind one route, and they are different *sets* rather than
  // two encodings of one: `csv` is the whole inventory, `stix` the actionable
  // subset. Declared as CSV because that is what an unqualified request serves.
  [
    /\/indicators$/,
    'text/csv',
    'The case\u2019s indicators. `?format=stix` serves the actionable subset as a STIX bundle instead.',
  ],
  // A download that is a POST - the export takes options in the body and
  // streams the `.iccase` back - which is what the fourth field is for.
  [/\/cases\/\{[^}]+\}\/archive$/, 'application/octet-stream', 'The case as a .iccase.', 'post'],
]

/**
 * The routes that answer with a small envelope rather than a row, keyed by
 * `METHOD path` and read off the handlers' return types.
 *
 * **An envelope belongs here; a document does not.** `{ settled: 3 }` is one
 * line in a handler and wants no schema file, while `About`, `InstallSettings`
 * and `Resources` are Zod schemas in their own controllers under
 * `@ZodResponse` - declaring one of those twice is how a reference ends up
 * describing a field the route stopped sending.
 */
const ENVELOPES: Readonly<Record<string, { said: string; shape: Record<string, unknown> }>> = {
  'POST /api/cases/{caseId}/conflicts/resolve': {
    said: 'How many refusals were settled.',
    shape: { type: 'object', properties: { settled: { type: 'integer' } } },
  },
  'POST /api/change-password': {
    said: 'The password was changed. Sign in again with the new one.',
    shape: { type: 'object', properties: { changed: { type: 'boolean' } } },
  },
  'PUT /api/appearance/avatar': {
    said: 'The picture was stored. The version busts every cached copy of it.',
    shape: { type: 'object', properties: { avatarVersion: { type: 'integer' } } },
  },
  'DELETE /api/appearance/avatar': {
    said: 'The picture was removed, and the version moved on so caches drop it.',
    shape: { type: 'object', properties: { avatarVersion: { type: 'integer' } } },
  },
}

/**
 * The success status an operation already declares, falling back to `200`.
 *
 * **Never hardcode one here.** Nest answers 201 to a POST unless `@HttpCode`
 * says otherwise and `@nestjs/swagger` reflects that, so the generated status
 * is the true one and attaching a body to `200` gives the operation two success
 * codes, one of which the route never answers.
 */
function successOf(operation: Operation): string {
  const declared = Object.keys(operation.responses ?? {}).find((code) => /^2\d\d$/.test(code))
  return declared ?? '200'
}

/**
 * The routes that answer with no body at all.
 *
 * **Stated rather than left blank.** Their handlers return `Promise<void>`, so
 * a schema here would be an invention - but an operation with an empty `200`
 * and no note reads as "undocumented" rather than "there is nothing to read",
 * and a generated client waits for a body that never comes.
 */
const NO_CONTENT: Readonly<Record<string, string>> = {
  'PUT /api/recent-cases/{caseId}': 'Recorded. Nothing is returned.',
  'DELETE /api/recent-cases/{caseId}': 'Forgotten. Nothing is returned.',
  'PUT /api/recent-cases/{caseId}/pinned': 'Pinned or unpinned. Nothing is returned.',
}

function asEmpty(operation: Operation, method: string, path: string): boolean {
  const said = NO_CONTENT[`${method.toUpperCase()} ${path}`]
  if (!said) return false
  operation.responses ??= {}
  const code = successOf(operation)
  const existing = (operation.responses[code] ?? {}) as { description?: string }
  operation.responses[code] = { ...existing, description: said }
  return true
}

function asEnvelope(operation: Operation, method: string, path: string): boolean {
  const found = ENVELOPES[`${method.toUpperCase()} ${path}`]
  if (!found) return false
  operation.responses ??= {}
  const code = successOf(operation)
  const existing = (operation.responses[code] ?? {}) as { content?: unknown }
  if (!existing.content) {
    operation.responses[code] = { ...existing, description: found.said, ...json(found.shape) }
  }
  return true
}

/**
 * The routes whose request body is bytes rather than JSON.
 *
 * **The mirror of `DOWNLOADS`, and needed for the same reason.** A DTO
 * describes an object; these take a file - an archive, a CSV, an image - so
 * there is no schema to attach and a caller reading the reference would
 * otherwise see a write that appears to accept nothing at all.
 */
const UPLOADS: ReadonlyArray<readonly [RegExp, string, string, string]> = [
  [
    /\/cases\/import$/,
    'post',
    'application/octet-stream',
    'The `.iccase` archive. A passphrase, if the archive is sealed, rides in `x-archive-passphrase`.',
  ],
  [
    /\/cases\/\{[^}]+\}\/\{[^}]+\}\.csv$/,
    'post',
    'text/csv',
    'The rows to add, with a header naming the columns. The header decides which collection the file is for.',
  ],
  [
    /\/appearance\/avatar$/,
    'put',
    'image/png',
    'The picture, as PNG, JPEG or WebP.',
  ],
]

function asUpload(operation: Operation, method: string, path: string): boolean {
  const found = UPLOADS.find(([pattern, verb]) => pattern.test(path) && verb === method)
  if (!found) return false
  const [, , media, said] = found
  ;(operation as { requestBody?: unknown }).requestBody = {
    required: true,
    description: said,
    content: { [media]: { schema: { type: 'string', format: 'binary' } } },
  }
  return true
}

function asDownload(operation: Operation, method: string, path: string): boolean {
  const found = DOWNLOADS.find(([pattern]) => pattern.test(path))
  // A download is a read unless the entry names a method: `PUT
  // /api/appearance/avatar` *sends* an image and answers a version number, so
  // matching on the pattern alone documents the request body as the response.
  if (!found || method !== (found[3] ?? 'get')) return false
  const [, media, said] = found
  operation.responses ??= {}
  const code = successOf(operation)
  const existing = (operation.responses[code] ?? {}) as { content?: unknown }
  if (!existing.content) {
    operation.responses[code] = {
      ...existing,
      description: said,
      content: { [media]: { schema: { type: 'string', format: 'binary' } } },
    }
  }
  return true
}

/**
 * The paths an anonymous caller reaches on purpose.
 *
 * **A list, not a pattern.** `/api/health` is public and
 * `/api/health/resources` is not, so no prefix works - one anchored at `/api`
 * published a 401-free contract for both. `test/anonymous-access.test.ts`
 * deliberately holds its own copy, so the two are compared in a diff rather
 * than agreeing by construction.
 */
const ANONYMOUS: ReadonlySet<string> = new Set([
  '/api/health',
  '/api/openapi.json',
  '/api/setup',
])

/** Nest's refusal body: a status, a message, and the exception's own name. */
const REFUSAL = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer' },
    message: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    error: { type: 'string' },
  },
} as const

/**
 * The 403 body, which is two shapes rather than one.
 *
 * `MustChangePasswordInterceptor` throws `ForbiddenException({ message,
 * mustChangePassword })`, and Nest uses an object argument as the body
 * *verbatim* - so that case answers with neither `statusCode` nor `error`,
 * where a role refusal throws the string form and gets Nest's standard three
 * fields. Only `message` is common to both, which is why this is not `REFUSAL`.
 *
 * `mustChangePassword` is what a client branches on: retry after
 * `POST /api/change-password`, or surface the refusal.
 */
const FORBIDDEN = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    mustChangePassword: {
      type: 'boolean',
      description: 'Present and true when the account has not set its own password yet.',
    },
    statusCode: { type: 'integer', description: 'Present on a role refusal only.' },
    error: { type: 'string', description: 'Present on a role refusal only.' },
  },
  required: ['message'],
} as const

/**
 * The refusal a caller has to *handle* rather than log. **`currentVersion` is
 * the whole point of the 409**: a refused save is a merge review, and the
 * analyst cannot word one without knowing what the row became.
 * -> `entities.controller.ts`
 */
const CONFLICT = {
  type: 'object',
  properties: {
    message: { type: 'string', example: 'Someone else wrote this first.' },
    currentVersion: {
      type: ['integer', 'null'],
      description: 'The version now stored \u2014 what the other analyst wrote over yours.',
    },
  },
} as const

/**
 * What every route can answer besides success.
 *
 * **Attached from the shape of the operation, never declared per route**: a
 * body means validation can refuse it, a path parameter means the thing may not
 * exist, and a versioned write means somebody else may have written first.
 * `@nestjs/swagger` documents only what a decorator says, and this codebase
 * validates through a pipe, so nothing else describes these.
 */
function refusals(method: string, path: string, hasBody: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const row = /\{[^}]+\}/.test(path)
  const versioned = method === 'patch' || method === 'delete'

  // Two statuses, and the split is the contract: a body the server cannot read
  // is 400; one it read and will not act on is 422. -> `wire/refusals.ts`
  if (hasBody) {
    out['400'] = {
      description: 'The body is not readable \u2014 malformed JSON, or not the media type this route takes.',
      ...json(REFUSAL),
    }
    out['422'] = {
      description:
        'The body was read and refused. `message` says what was wrong; `errors` says where, ' +
        'on routes that answer with a tree.',
      ...json(REFUSAL),
    }
  }
  if (!ANONYMOUS.has(path)) {
    out['401'] = {
      description: 'No session. Sign in at `POST /api/auth/sign-in/email` and send the cookie.',
      ...json(REFUSAL),
    }
    // 403 is reachable wherever 401 is and no route declares it:
    // `MustChangePasswordInterceptor` is global, so a per-controller
    // declaration would miss most of the paths that answer it.
    out['403'] = {
      description:
        'Signed in and refused. Either the route is administrator-only, or the account ' +
        'has not set its own password, which `mustChangePassword` in the body marks.',
      ...json(FORBIDDEN),
    }
  }
  if (row) {
    out['404'] = {
      description:
        'No such case, or no such row inside it. A deleted row is indistinguishable ' +
        'from one that never existed.',
      ...json(REFUSAL),
    }
  }
  if (row && versioned) {
    out['409'] = {
      description:
        'Somebody else wrote this row first. Not a retry \u2014 raise a merge review with the ' +
        'version below.',
      ...json(CONFLICT),
    }
  }
  // 429 comes from nginx (`limit_req_status` in `docker/nginx/default.conf`),
  // so no controller can declare it. The thresholds stay out: they live in that
  // config, and a copy here would be both a second thing to keep true and wrong
  // as shipped.
  out['429'] = {
    description:
      'Rate-limited by the reverse proxy rather than the application, so it applies to ' +
      'every route. The auth routes carry a lower threshold than the rest.',
    ...json(REFUSAL),
  }
  // Every `description` here is a reference entry rather than an error message:
  // it names the condition and the discriminating field, and gives no advice.
  // -> `rules/writing-style.md`
  out['500'] = {
    description:
      'Unhandled server fault. The body carries nothing beyond the refusal shape; the ' +
      'cause is in the server log only.',
    ...json(REFUSAL),
  }
  return out
}

/**
 * Give a collection route the shapes it accepts and returns, from
 * `PUBLISHABLE` keyed by the path's own segment. Does nothing for a path that
 * names no collection.
 *
 * **A pass rather than a decorator per route, because the routes are
 * inherited**: the collection controllers share one base, so a decorator there
 * gives every collection the same body.
 *
 * **A PATCH takes a partial and a POST does not** - documenting both as the
 * full row tells a caller every field is required to change one.
 */
function describe(
  operation: Operation,
  method: string,
  path: string,
  resource: string | undefined,
): void {
  const rows = resource ? schemaFor(resource) : undefined
  if (!rows || !resource) return

  const one = !path.endsWith(`/${resource}`) && !path.endsWith('/bulk')
  const bulk = path.endsWith('/bulk')
  const many = humanise(resource).toLowerCase()

  // One sentence under the title, written from the operation's shape so a
  // collection added tomorrow gets one too.
  operation.description ??= {
    get: one
      ? `The row as stored, including the \`version\` a later write must present.`
      : // **"on the case" only when it is on a case.** `/api/cases` is the
        // install's own list, where an unconditional phrasing reads "Every
        // case on the case, in the order the analyst arranged them."
        path.startsWith('/api/cases/')
        ? `Every ${singular(resource)} on the case, in the order the analyst arranged them.`
        : `Every ${singular(resource)} this install holds.`,
    post: bulk
      ? `Add several ${many} in one write. Announced to every open screen once.`
      : `Add one. The response carries the stored row, including its id and first \`version\`.`,
    patch: bulk
      ? `Change several ${many} in one write. Each entry presents its own \`version\`.`
      : `Change the fields named in the body and leave the rest. Present the \`version\` the ` +
        `row was read at.`,
    delete: `Remove it. Presents the \`version\` it was read at, for the same reason a change does.`,
  }[method]

  const patchForm = patchFormOf(PUBLISHABLE[resource]!)
  const partial = patchForm ? published(patchForm) : rows
  const ids = { type: 'array', items: { type: 'string', format: 'uuid' } }

  // The bulk bodies are envelopes, not arrays: `POST /bulk` takes
  // `{ entries: [...] }` and `PATCH /bulk` takes `{ ids, fields }` - one patch
  // applied to many rows rather than one patch each.
  if (method === 'post') {
    operation.requestBody ??= json(
      bulk
        ? {
            type: 'object',
            required: ['entries'],
            properties: { entries: { type: 'array', maxItems: 1000, items: rows } },
          }
        : rows,
    )
  }
  if (method === 'patch') {
    operation.requestBody ??= json(
      bulk
        ? {
            type: 'object',
            required: ['ids', 'fields'],
            properties: {
              ids: { ...ids, maxItems: 1000, description: 'The rows to change.' },
              fields: { ...partial, description: 'Applied to every row in `ids`.' },
            },
          }
        : partial,
    )
  }

  /**
   * What each write answers with. **Read off the handlers rather than
   * assumed**: a create returns the stored row, a bulk create returns only the
   * ids it minted, and a delete returns `{ deleted: true }` rather than the
   * row it removed.
   */
  if (method === 'post' || method === 'patch' || method === 'delete') {
    operation.responses ??= {}
    const code = successOf(operation)
  const existing = (operation.responses[code] ?? {}) as { description?: string; content?: unknown }
    if (!existing.content) {
      const [said, shape] =
        method === 'delete'
          ? ['Removed.', { type: 'object', properties: { deleted: { type: 'boolean' } } }]
          : bulk && method === 'post'
            ? ['The ids minted, in the order the entries were given.',
               { type: 'object', properties: { ids } }]
            : bulk
              ? ['The rows as stored.', { type: 'array', items: rows }]
              : ['The row as stored, with its new `version`.', rows]
      operation.responses[code] = { ...existing, description: said, ...json(shape) }
    }
  }
  if (method === 'get') {
    operation.responses ??= {}
    // Merged, not defaulted: Nest always emits a `200` of
    // `{ description: '' }`, so `??=` never fires. What is missing is the
    // *content*, so that is what is tested for.
    const code = successOf(operation)
  const existing = (operation.responses[code] ?? {}) as { description?: string; content?: unknown }
    if (!existing.content) {
      operation.responses[code] = {
        ...existing,
        description: existing.description || (one ? 'The row.' : 'Every row in the collection.'),
        ...json(one ? rows : { type: 'array', items: rows }),
      }
    }
  }
}
