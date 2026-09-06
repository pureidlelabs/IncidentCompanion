/**
 * **Every published case-scoped route carries `CaseAccessGuard` and spells its
 * parameter `caseId`** - which nothing behavioural can see: an unguarded route
 * still answers 404 for an id naming no case, because its service does.
 *
 * Walked from the published document rather than a list kept here, with the
 * guards matched back out of Nest's own container - and the container checked
 * against the document, since one `@ApiExcludeEndpoint()` would otherwise
 * remove a handler from every sweep below.
 */
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CaseAccessGuard } from './case-access.guard.js'
import { boot, bootable, operations, type Harness } from '../../test/app-harness.js'

const runnable = await bootable()

interface Handler {
  /** for example `GET /api/cases/{caseId}/compliance` - the document's own spelling. */
  route: string
  where: string
  guards: unknown[]
}

const VERB = new Map<number, string>(
  Object.entries(RequestMethod)
    .filter(([, value]) => typeof value === 'number')
    .map(([name, value]) => [value as number, name]),
)

function template(...parts: string[]): string {
  const joined = parts
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment !== '' && segment !== '/')
    .join('/')
  return `/${joined}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

/** `@Controller` and the method decorators each take a string or an array. */
const only = (path: unknown): string => {
  const first: unknown = Array.isArray(path) ? path[0] : path
  return typeof first === 'string' ? first : ''
}

/**
 * Every request handler the container holds, with the guards that will run in
 * front of it.
 *
 * **Class metadata and method metadata both count**, because a controller may
 * declare the guard once for all its routes (`ExportsController`) or per
 * handler where some of its routes are not case-scoped (`CasesController`).
 * Reading only one of them would report half the server as unguarded.
 */
function handlers(harness: Harness): Handler[] {
  const found: Handler[] = []
  for (const module of harness.app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype
      if (typeof controller !== 'function') continue
      const base = only(Reflect.getMetadata(PATH_METADATA, controller))
      const onClass = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[]

      /**
       * **Up the prototype chain, not just the class's own properties.** The
       * eleven collection controllers are generated from one base class and
       * declare no method of their own - reading own properties alone found
       * every route in the server except the ones that dominate it.
       */
      const proto = controller.prototype as Record<string, unknown>
      const names = new Set<string>()
      for (let at: object | null = proto; at && at !== Object.prototype; at = Object.getPrototypeOf(at) as object | null) {
        for (const name of Object.getOwnPropertyNames(at)) names.add(name)
      }

      for (const name of names) {
        const method = proto[name]
        if (typeof method !== 'function' || name === 'constructor') continue
        const verb = Reflect.getMetadata(METHOD_METADATA, method)
        if (verb === undefined) continue
        const onMethod = (Reflect.getMetadata(GUARDS_METADATA, method) ?? []) as unknown[]
        found.push({
          route: `${VERB.get(verb as number) ?? String(verb)} ${template(base, only(Reflect.getMetadata(PATH_METADATA, method)))}`,
          where: `${controller.name}.${name}`,
          guards: [...onClass, ...onMethod],
        })
      }
    }
  }
  return found
}

/**
 * Every published operation that is **not** scoped to one case.
 *
 * **The sweep is default-deny and this list is the whole exemption**, so a
 * route added anywhere, spelled anything, fails until somebody guards it or
 * writes it here. Selecting the sweep's subjects by path instead was tried
 * twice and is circular both ways.
 *
 * These are install-scoped: the account and appearance surfaces, the
 * registries, health, setup, and the case routes that name no case
 * (`GET /api/cases`, `POST /api/cases`, `POST /api/cases/import`, and the two
 * import doors that start one -- there is no case to be scoped to until the
 * import creates it, and both write through `CasesService` under the caller's
 * own session).
 */
const INSTALL_ROUTES: ReadonlySet<string> = new Set([
  // The customer directory scopes to no case: the customer is the subject,
  // and one may hold no cases at all -- a merge is refused when it does.
  'DELETE /api/customers/{id}',
  'GET /api/customers',
  'PATCH /api/customers/{id}',
  'POST /api/customers',
  'POST /api/customers/{id}/merge',
  'GET /api/groups',
  'POST /api/groups',
  // Granting reach is managing the install and scopes to no case: the group
  // is the subject, and the customers it holds may have no cases at all.
  'DELETE /api/groups/{groupId}/customers/{customerId}',
  'DELETE /api/groups/{groupId}/members/{userId}',
  'POST /api/groups/{groupId}/customers',
  'POST /api/groups/{groupId}/members',
  'DELETE /api/appearance/avatar',
  'DELETE /api/library/{slug}/{name}',
  'DELETE /api/report/languages/{code}',
  'GET /api/about',
  'GET /api/accounts',
  'GET /api/appearance',
  'GET /api/appearance/roster',
  'GET /api/appearance/{userId}/avatar',
  'GET /api/cases',
  'POST /api/imports/case',
  'POST /api/imports/preview',
  // The install's own audit. Admin-gated at the class, and about the
  // installation rather than any case - it outlives every case it names.
  'GET /api/install/activity',
  // How long the audit is kept, and the route that changes it. About the
  // installation rather than any case.
  'GET /api/install/audit/retention',
  'PUT /api/install/audit/retention',
  'GET /api/install/policy',
  'PUT /api/install/policy',
  'GET /api/collections',
  'GET /api/demos',
  'GET /api/health',
  'GET /api/health/activity',
  'GET /api/health/resources',
  'GET /api/library/{slug}',
  'GET /api/library/{slug}/document',
  'GET /api/library/{slug}/{name}/editor',
  'GET /api/openapi.json',
  'GET /api/recent-cases',
  'GET /api/regimes',
  'GET /api/report-block-kinds',
  'GET /api/report-layouts',
  'GET /api/report-snippets',
  'GET /api/report/languages',
  'GET /api/settings',
  'GET /api/setup',
  'GET /api/specs',
  'PATCH /api/appearance',
  'POST /api/accounts',
  'POST /api/accounts/{username}/disable',
  'POST /api/accounts/{username}/enable',
  'POST /api/accounts/{username}/reset',
  'POST /api/accounts/{username}/role',
  'POST /api/cases',
  'POST /api/cases/import',
  'POST /api/change-password',
  'POST /api/library/{slug}',
  'POST /api/library/{slug}/{name}/editor',
  'POST /api/regimes/{name}',
  'POST /api/setup',
  'PUT /api/appearance/avatar',
  'PUT /api/library/{slug}',
  'PUT /api/report/languages',
])

/**
 * Mounted and deliberately absent from the document.
 *
 * **None is case-scoped, and that is the property this list defends.** They are
 * the self-served docs page, the brand files and the SPA shell - static reads
 * with no case in them. An entry gained here is a route that no sweep in this
 * file can see, so it is a decision rather than an omission.
 */
const UNPUBLISHED_ROUTES: ReadonlySet<string> = new Set([
  'GET /api/docs',
  'GET /api/docs/boot.js',
  'GET /favicon.ico',
  'GET /favicon.svg',
  'GET /wordmark.png',
  'GET /{*path}',
])

describe.skipIf(!runnable)('every case route goes through CaseAccessGuard', () => {
  let harness: Harness
  let published: string[]
  let mounted: Map<string, Handler>

  beforeAll(async () => {
    harness = await boot()
    published = operations(harness.document).map(
      (operation) => `${operation.method} ${operation.template}`,
    )
    mounted = new Map(handlers(harness).map((handler) => [handler.route, handler]))
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * **The vacuity guard, and it is the assertion most likely to fail first.**
   * A sweep that matched nothing - a renamed prefix, a document that stopped
   * publishing paths, metadata read the wrong way - passes every check below
   * while covering zero routes.
   */
  it('finds every published route in the container', () => {
    // 151 operations at the time of writing; the floor is well under it so
    // removing a collection is not a failure, and well over zero.
    expect(published.length).toBeGreaterThan(100)
    expect(published.filter((route) => !mounted.has(route))).toEqual([])
  })

  /**
   * **The document is derived, and `@ApiExcludeEndpoint()` removes a route
   * from it** - and therefore from every assertion above, which walks
   * `published`. The container is the ground truth, so everything mounted has
   * to be accounted for somewhere.
   */
  it('publishes every mounted route, or names it as deliberately unpublished', () => {
    const unaccounted = [...mounted.keys()]
      .filter((route) => !published.includes(route))
      .filter((route) => !UNPUBLISHED_ROUTES.has(route))
    expect(
      unaccounted,
      'a route missing from the document is invisible to every sweep in this file',
    ).toEqual([])
  })

  it('has a guard in front of every route not named as install-scoped', () => {
    const naked = published
      .filter((route) => !INSTALL_ROUTES.has(route))
      .filter((route) => !mounted.get(route)?.guards.includes(CaseAccessGuard))
    expect(
      naked.map((route) => `${route} (${mounted.get(route)?.where ?? 'nowhere'})`),
      'a case route with no CaseAccessGuard is unscoped the day membership lands',
    ).toEqual([])
  })

  /**
   * **A stale exemption is a hole with a delay on it.** An entry whose route
   * is gone exempts nothing today and silently exempts whatever is published
   * under that path next -- the list has to describe the server, not a server.
   */
  it('names no route the server no longer publishes', () => {
    const published_ = new Set(published)
    expect([...INSTALL_ROUTES].filter((route) => !published_.has(route))).toEqual([])
  })

  /**
   * **The half that has no runtime symptom.** The guard reads
   * `params['caseId']`, so `/api/cases/{id}/compliance` would have been waved
   * through with the decorator present and correct.
   *
   * Asserted over everything the guard is mounted on, which the inversion is
   * what makes possible: selecting routes *by* the spelling made this a
   * tautology on the half that needed it most.
   */
  it('names the case parameter caseId in every guarded route', () => {
    const misspelt = published
      .filter((route) => mounted.get(route)?.guards.includes(CaseAccessGuard))
      .map((route) => route.split(' ')[1]!)
      .filter((path) => !path.includes('{caseId}'))
    expect(misspelt, 'the guard reads caseId and no other spelling').toEqual([])
  })
})
