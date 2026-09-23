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
import { ParseUUIDPipe, RequestMethod, type INestApplication } from '@nestjs/common'
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants'
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js'
import { ModulesContainer } from '@nestjs/core'

import { CaseAccessGuard } from './access/case-access.guard.js'
import { AuthService } from '@thallesp/nestjs-better-auth'
import { OFFERED, type Auth } from './auth/auth.config.js'

import {
  asDownload,
  asEmpty,
  asEnvelope,
  asUpload,
  describeOperation,
  groupOf,
  humanise,
  PARAMETERS,
  refusals,
  resourceOf,
  summarise,
  type Operation,
} from './openapi.prose.js'

export async function openApiDocument(app: INestApplication): Promise<OpenAPIObject> {
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
        'cookie with every request after that. A few operations work without one:',
        'signing in and out, reading the session, `GET /api/health`, `GET /api/about`,',
        'this document, and the two `/api/setup` routes that claim an install with no',
        'accounts yet.',
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

  const document = SwaggerModule.createDocument(app, spec)
  await withTheLibrarysOperations(document, app.get<AuthService<Auth>>(AuthService).instance)
  return publishedDocument(document, uuidParsedRoutes(app))
}

/**
 * Refusals of the library's operations that the document's own set does not
 * describe, because the lockout that decides them is this install's.
 */
const LIBRARY_REFUSALS: Readonly<Record<string, Record<string, unknown>>> = {
  'POST /sign-in/email': {
    '401': {
      description:
        'The address and password sign nobody in. No such account, a wrong password and a ' +
        'locked account are answered alike.',
    },
  },
}

/** Names the library's schemas are published under, so none collides with ours. */
const LIBRARY_SCHEMA = (name: string) => `Auth${name}`

/**
 * Add every operation `OFFERED` names, as the library describes it, to
 * `document` in place: its summary, its body and its success answer. The
 * refusals are the document's own, attached with everyone else's by `tidy`.
 *
 * Throws where an offered operation is one the library does not describe.
 */
export async function withTheLibrarysOperations(
  document: OpenAPIObject,
  auth: Auth,
): Promise<void> {
  // The library's description omits its mount; its router strips this one.
  const mount = new URL((await auth.$context).baseURL).pathname
  const described = (await auth.api.generateOpenAPISchema()) as unknown as {
    paths: Record<string, Record<string, Record<string, unknown>>>
    components: { schemas: Record<string, unknown> }
  }
  const renamed = (value: unknown): unknown =>
    JSON.parse(
      JSON.stringify(value).replace(
        /#\/components\/schemas\/(\w+)/g,
        (_, name: string) => `#/components/schemas/${LIBRARY_SCHEMA(name)}`,
      ),
    ) as unknown

  const referenced = new Set<string>()
  for (const offered of OFFERED) {
    const [method, path] = offered.split(' ') as [string, string]
    const operation = described.paths[path]?.[method.toLowerCase()]
    if (!operation) throw new Error(`${offered} is offered and the library does not describe it`)
    const responses = operation['responses'] as Record<string, unknown>
    const body = operation['requestBody'] as
      | { content?: Record<string, { schema?: { properties?: object } }> }
      | undefined
    // The library describes a body-less POST as an empty object; it reads none.
    const takesABody = Object.keys(body?.content?.['application/json']?.schema?.properties ?? {})
      .length > 0
    const kept = renamed({
      summary: operation['description'],
      operationId:
        operation['operationId'] ?? path.replace(/[/-](\w)/g, (_, one: string) => one.toUpperCase()),
      ...(takesABody ? { requestBody: body } : {}),
      responses: {
        ...Object.fromEntries(Object.entries(responses).filter(([code]) => /^2/.test(code))),
        ...LIBRARY_REFUSALS[offered],
      },
    })
    for (const [, name] of JSON.stringify(kept).matchAll(/#\/components\/schemas\/Auth(\w+)/g)) {
      referenced.add(name!)
    }
    const at = (document.paths[`${mount}${path}`] ??= {}) as Record<string, unknown>
    at[method.toLowerCase()] = kept
  }

  document.components ??= {}
  document.components.schemas ??= {}
  for (const name of referenced) {
    document.components.schemas[LIBRARY_SCHEMA(name)] = nullableWhereOptional(
      described.components.schemas[name] as LibrarySchema,
    ) as never
  }
}

interface LibrarySchema {
  required?: string[]
  properties?: Record<string, { type?: unknown }>
}

/**
 * A library schema with every property it does not require allowed to be
 * null, which is how the library serves an optional column it has no value
 * for. Its own description types each one as its value alone.
 */
function nullableWhereOptional(schema: LibrarySchema): LibrarySchema {
  const required = new Set(schema.required ?? [])
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([name, property]) => [
        name,
        required.has(name) || typeof property.type !== 'string'
          ? property
          : { ...property, type: [property.type, 'null'] },
      ]),
    ),
  }
}

/** `@Controller` and the method decorators each take a string or an array. */
const firstPath = (path: unknown): string => {
  const first: unknown = Array.isArray(path) ? path[0] : path
  return typeof first === 'string' ? first : ''
}

/** The document's spelling of a route: `/api/cases/{caseId}` from `cases/:caseId`. */
const joined = (...parts: string[]): string =>
  `/${parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}')

const guardsTheCase = (guard: unknown): boolean =>
  guard === CaseAccessGuard || guard instanceof CaseAccessGuard

/**
 * Whether this handler binds a path parameter through `ParseUUIDPipe`, told from
 * a `@Query('id', ParseUUIDPipe)` - which refuses with the same 400 and is not
 * in the path - by the parameter type in the `ROUTE_ARGS_METADATA` key rather
 * than by the name it binds.
 */
function parsesAUuid(controller: object, method: string): boolean {
  const bound = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {}) as Record<
    string,
    { pipes?: unknown[] }
  >
  return Object.entries(bound).some(
    ([key, one]) =>
      key.startsWith(`${RouteParamtypes.PARAM}:`) &&
      (one.pipes ?? []).some((pipe) => pipe === ParseUUIDPipe || pipe instanceof ParseUUIDPipe),
  )
}

/**
 * Every route that refuses a malformed path parameter before its handler runs,
 * spelled `get /api/cases/{caseId}`.
 */
export function uuidParsedRoutes(app: INestApplication): Set<string> {
  const found = new Set<string>()
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype
      if (typeof controller !== 'function') continue
      const base = firstPath(Reflect.getMetadata(PATH_METADATA, controller))
      const onClass = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[]

      // Up the prototype chain: routes are inherited from a base controller.
      const proto = controller.prototype as Record<string, unknown>
      const names = new Set<string>()
      for (
        let at: object | null = proto;
        at && at !== Object.prototype;
        at = Object.getPrototypeOf(at) as object | null
      ) {
        for (const name of Object.getOwnPropertyNames(at)) names.add(name)
      }

      for (const name of names) {
        if (name === 'constructor') continue
        const handler: unknown = proto[name]
        if (typeof handler !== 'function') continue
        const verb: unknown = Reflect.getMetadata(METHOD_METADATA, handler)
        if (typeof verb !== 'number') continue

        const template = joined(base, firstPath(Reflect.getMetadata(PATH_METADATA, handler)))
        const guards = [
          ...onClass,
          ...((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[]),
        ]
        if (!guards.some(guardsTheCase) && !parsesAUuid(controller, name)) continue
        found.add(`${RequestMethod[verb]!.toLowerCase()} ${template}`)
      }
    }
  }
  return found
}

/**
 * Everything done to the document `@nestjs/swagger` hands back, in the order it
 * has to happen in.
 *
 * `cleanupOpenApiDoc` is `nestjs-zod` 5's replacement for v4's
 * `patchNestJsSwagger()`, and skipping it ships schemas nothing validates
 * against. It also drops the `x-nestjs_zod-*` marks, so anything reading one
 * runs before it.
 */
export function publishedDocument(
  document: OpenAPIObject,
  uuidParsed: ReadonlySet<string>,
): OpenAPIObject {
  withoutArrayShorthand(document)
  return tidy(cleanupOpenApiDoc(document), uuidParsed)
}

/** `nestjs-zod`'s mark on a property whose JSON Schema type is not a string. */
const EMPTY_TYPE = 'x-nestjs_zod-empty-type'

/**
 * Restore, under `node` and in place, every JSON Schema type union
 * `@nestjs/swagger` read as its own array shorthand.
 *
 * `type: [String]` is how `@ApiProperty` spells *array of String*, and Zod 4
 * emits `z.string().nullable()` as `type: ['string', 'null']`.
 */
function withoutArrayShorthand(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(withoutArrayShorthand)
    return
  }
  if (node === null || typeof node !== 'object') return

  const schema = node as Record<string, unknown>
  const items = schema['items'] as Record<string, unknown> | undefined
  if (
    schema[EMPTY_TYPE] === true &&
    schema['type'] === 'array' &&
    typeof items?.['type'] === 'string'
  ) {
    // ponytail: only the first member survives the flattening, so the second
    // is assumed to be `null`. A scalar union that is not nullable -
    // `z.union([z.string(), z.number()])` - restores as `['string', 'null']`;
    // thread the Zod schema in per component if one is ever declared.
    schema['type'] = [items['type'], 'null']
    delete schema['items']
  }
  Object.values(schema).forEach(withoutArrayShorthand)
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
 * tomorrow is documented without touching this file. The one thing the paths
 * cannot answer is `uuidParsed`, which `uuidParsedRoutes` reads off the
 * controllers.
 */
export function tidy(document: OpenAPIObject, uuidParsed: ReadonlySet<string>): OpenAPIObject {
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
        describeOperation(one, method, path, resource)
      }

      /**
       * Attached last, so a body added just above is seen and answered with
       * the 400 that goes with it - and **outside every pass above**, because
       * a route reaching this by only one branch loses its 401 and 500 as an
       * absence rather than a failure. Held by `openapi.test.ts`.
       */
      const queried = (one.parameters ?? []).some(
        (parameter) => (parameter as { in?: string }).in === 'query',
      )
      one.responses = {
        ...refusals(
          method,
          path,
          Boolean(one.requestBody),
          queried,
          uuidParsed.has(`${method} ${path}`),
        ),
        ...one.responses,
      }
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
