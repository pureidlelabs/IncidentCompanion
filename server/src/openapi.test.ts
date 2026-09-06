/**
 * The API document, and the one failure that is worse than a bad document: a
 * schema that cannot be published, which is a throw out of bootstrap because
 * the document is built in `main.ts`.
 *
 * **What none of this covers is the document the server actually serves.**
 * Every case below builds a fixture and runs `tidy` over it, so a route whose
 * path or decorators changed is invisible here - `test/openapi-contract.test.ts`
 * and `test/documented-bodies.test.ts` are the tier that reads the real one.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { NotFoundException } from '@nestjs/common'

import { caseSchema, createCaseSchema } from './cases/cases.dto.js'
import { groupOf, humanise, published, resourceOf, summarise, tidy } from './openapi.js'
import { COLLECTION_SCHEMAS } from './domain/collections.js'
import { fields, patchSchema } from './domain/field-spec.js'
import { timelineWriteSchema } from './domain/entities/timeline.js'
import type { OpenAPIObject } from '@nestjs/swagger'
import { OpenApiController, OpenApiStore } from './openapi.controller.js'
import { ResourcesController } from './health/resources.controller.js'

/**
 * **A prose rule in one file governs one file.**
 * `domain/entities/network-indicator.ts` says a published schema must speak
 * the wire's vocabulary because `z.date()` cannot be expressed; this governs
 * every schema named here.
 */
describe('every schema the document publishes can be expressed as JSON Schema', () => {
  it.each([
    ['caseSchema', caseSchema],
    ['createCaseSchema', createCaseSchema],
  ])('%s', (_name, schema) => {
    expect(() => z.toJSONSchema(schema as z.ZodType)).not.toThrow()
  })

  /**
   * **Every registered collection, by name from the registry itself.** The
   * document pass publishes each of these, so an unpublishable field anywhere
   * in an entity schema throws during bootstrap and stops the server coming
   * up. Listing them from `COLLECTION_SCHEMAS` rather
   * than by hand is what makes a collection added tomorrow covered too.
   */
  it.each(Object.entries(COLLECTION_SCHEMAS))('the %s collection publishes', (_name, schema) => {
    expect(() => z.toJSONSchema(schema)).not.toThrow()
  })

  it.each(Object.entries(COLLECTION_SCHEMAS))('the %s patch publishes', (_name, schema) => {
    expect(() => z.toJSONSchema(patchSchema(schema))).not.toThrow()
  })

  /**
   * The control: this is the shape that broke it, so if `toJSONSchema` ever
   * stops throwing on a `Date` the test above has quietly stopped proving
   * anything and this one says so.
   */
  it('still refuses a z.date(), which is what makes the check above real', () => {
    expect(() => z.toJSONSchema(z.object({ at: z.date() }))).toThrow()
  })

  it('accepts an ISO datetime, which is what the wire carries', () => {
    expect(() => z.toJSONSchema(z.object({ at: z.iso.datetime() }))).not.toThrow()
  })
})

describe('who may read the document', () => {
  const isPublic = (target: object, method: string): boolean =>
    Reflect.getMetadata('PUBLIC', (target as Record<string, () => unknown>)[method]!) === true

  /**
   * **Public, because guarding it buys nothing and costs every load.** It
   * withholds route *names* from a caller who can already reach every route -
   * this server binds loopback - and `/api/docs` then renders with its fetch
   * 401'd, the viewer reporting *"could not be fetched. This could indicate
   * connectivity problems"* and blaming the network for a sign-in state.
   */
  it('is readable without a session, like the shell and the health probe', () => {
    expect(isPublic(OpenApiController.prototype, 'read')).toBe(true)
  })

  /**
   * **The line is what the response contains, and this is the other side of
   * it.** Route shapes travel; free disk, load average and heap size describe
   * the machine and do not. Asserted here so the two decisions are read
   * together rather than one being copied onto the other.
   */
  it('does not make the machine metrics public along with it', () => {
    expect(isPublic(ResourcesController.prototype, 'read')).toBe(false)
  })
})

describe('making the generated document readable', () => {
  /**
   * `@nestjs/swagger` names a group after the controller *class*, so the
   * generated reference groups by `BulkDelete`, `CloudApps` and `OpenApi` -
   * internal identifiers on a page meant to describe the API.
   */
  it.each([
    ['BulkDelete', 'Bulk delete'],
    ['CloudApps', 'Cloud apps'],
    ['NetworkIndicators', 'Network indicators'],
    ['Cases', 'Cases'],
    ['AboutController', 'About'],
  ])('reads %s as %s', (given, expected) => {
    expect(humanise(given)).toBe(expected)
  })

  const built = (): OpenAPIObject =>
    tidy({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/zebra': { get: { tags: ['Zebra'], responses: {} } },
        '/api/cases/{caseId}': {
          get: { tags: ['Cases'], responses: {} },
          patch: { tags: ['Cases'], responses: {} },
        },
        '/favicon.ico': { get: { tags: ['Brand'], responses: {} } },
        '/{*path}': { get: { tags: ['Spa'], responses: {} } },
        '/api/docs': { get: { tags: ['Docs'], responses: {} } },
        '/api/docs/boot.js': { get: { tags: ['Docs'], responses: {} } },
      },
    })

  /**
   * **The catch-all is the one that must go.** `/{*path}` is the SPA fallback,
   * so the document claimed an operation on every address the app has.
   */
  it.each([
    ['the SPA catch-all', '/{*path}'],
    ['the favicon', '/favicon.ico'],
    /**
     * **The viewer begins with `/api` and is not an API route.** Testing the
     * prefix without its slash lists a group called "Docs" describing the
     * reference's own viewer.
     */
    ['the reference viewer itself', '/api/docs'],
    ['the viewer\u2019s boot script', '/api/docs/boot.js'],
  ])('drops %s, which is a page rather than an endpoint', (_what, path) => {
    expect(Object.keys(built().paths)).not.toContain(path)
  })

  it('keeps the API paths', () => {
    expect(Object.keys(built().paths).sort()).toEqual(['/api/cases/{caseId}', '/api/zebra'])
  })

  describe('the mark above the contents page', () => {
    const info = () => built().info as unknown as Record<string, { url: string; href: string }>

    it('points at a route this server serves', () => {
      expect(info()['x-logo']?.url).toBe('/wordmark.png')
    })

    /**
     * **Relative, like every other URL the reference draws.** The port is not
     * knowable at build time - a taken one silently becomes the next free -
     * and an absolute logo would break on every address but one.
     */
    it('names it relatively, not by host and port', () => {
      expect(info()['x-logo']?.url.startsWith('/')).toBe(true)
      expect(JSON.stringify(info()['x-logo'])).not.toMatch(/https?:\/\//)
    })

    it('keeps the title and version beside it', () => {
      expect(built().info.title).toBe('t')
      expect(built().info.version).toBe('1')
    })
  })

  it('tags each operation with its resource', () => {
    expect(built().tags?.map((t) => t.name)).toEqual(['Cases', 'Zebra'])
  })

  /**
   * **Two levels, because neither single-level answer works.** The resource
   * alone gives a heading per resource; folding them into the eight puts most
   * of the operations under one. Redoc reads `x-tagGroups`, so the contents
   * page is eight subjects that open onto their tables.
   */
  it('nests the resource tags under a small set of headings', () => {
    const groups = (built() as unknown as { 'x-tagGroups': { name: string; tags: string[] }[] })[
      'x-tagGroups'
    ]
    expect(groups.map((g) => g.name)).toEqual(['Cases', 'Zebra'])
    expect(groups.find((g) => g.name === 'Cases')?.tags).toEqual(['Cases'])
  })

  /**
   * **A tag in two groups draws every operation under it twice.** Redoc renders
   * a tag beneath *every* group that lists it, and both `#tag/Cases` anchors
   * then resolve to the same place.
   *
   * The fixture carries both causes: `/api/cases/import` reads `cases` off the
   * front of the path though it is an archive import, and a case's compromised
   * `accounts` genuinely share a word with the install's analyst logins.
   */
  it('never lists one tag under two headings', () => {
    const out = tidy({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/cases': { get: { responses: {} } },
        '/api/cases/import': { post: { responses: {} } },
        '/api/cases/{caseId}/{collection}.csv': { get: { responses: {} } },
        '/api/cases/{caseId}/accounts': { get: { responses: {} } },
        '/api/accounts': { get: { responses: {} } },
      },
    }) as unknown as { 'x-tagGroups': { name: string; tags: string[] }[] }

    const seen = new Map<string, string[]>()
    for (const group of out['x-tagGroups']) {
      for (const tag of group.tags) seen.set(tag, [...(seen.get(tag) ?? []), group.name])
    }
    expect([...seen.entries()].filter(([, groups]) => groups.length > 1)).toEqual([])
  })

  it('reads a literal segment under /api/cases as its own subject', () => {
    expect(resourceOf('/api/cases/import')).toBe('import')
    expect(resourceOf('/api/cases/{id}')).toBe('cases')
  })

  it('names the csv export by its extension, not by the case', () => {
    expect(resourceOf('/api/cases/{caseId}/{collection}.csv')).toBe('csv')
    expect(humanise('csv')).toBe('CSV export')
  })

  it('qualifies a name two headings both want', () => {
    const out = tidy({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/cases/{caseId}/accounts': { get: { responses: {} } },
        '/api/accounts': { get: { responses: {} } },
      },
    }) as unknown as { 'x-tagGroups': { name: string; tags: string[] }[] }
    const all = out['x-tagGroups'].flatMap((g) => g.tags)
    expect(all).toHaveLength(new Set(all).size)
    expect(all.some((t) => t.includes('('))).toBe(true)
  })

  /**
   * **A heading carries its tags and nothing else.** Redoc's schema has no
   * field for a `description`, so one written here is asserted and rendered
   * nowhere. Adding one makes the document fail `struct`.
   */
  it('gives a heading its tags and no field the viewer cannot read', () => {
    const out = tidy({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: { '/api/cases/{caseId}/systems': { get: { tags: ['X'], responses: {} } } },
    }) as unknown as { 'x-tagGroups': Record<string, unknown>[] }
    const data = out['x-tagGroups'].find((g) => g.name === 'Case data')

    expect(data).toBeDefined()
    expect(Object.keys(data!).sort()).toEqual(['name', 'tags'])
  })

  describe('how many headings a reader is given', () => {
    /**
     * Grouping by resource is right for a summary and wrong for navigation:
     * the case collections share one shape and belong under one heading, in a
     * viewer that draws a single flat list.
     */
    it.each([
      ['/api/cases/{caseId}/systems', 'Case data'],
      ['/api/cases/{caseId}/network_indicators/bulk', 'Case data'],
      ['/api/cases/{caseId}/evidence/{id}/file', 'Case data'],
      ['/api/cases/{caseId}/timeline', 'Case data'],
      ['/api/cases/{caseId}/reports/{id}/send', 'Reports'],
      ['/api/cases/{caseId}/report.docx', 'Reports'],
      ['/api/report-snippets', 'Reports'],
      ['/api/cases/{id}/compliance/verdict', 'Compliance'],
      ['/api/regimes', 'Compliance'],
      ['/api/cases/{caseId}/archive', 'Archive'],
      ['/api/cases/import', 'Archive'],
      ['/api/cases', 'Cases'],
      ['/api/recent-cases', 'Cases'],
      ['/api/library/{slug}', 'Library'],
      ['/api/accounts', 'Accounts and access'],
      ['/api/health', 'This install'],
    ])('files %s under %s', (path, group) => {
      expect(groupOf(path)).toBe(group)
    })

    /**
     * **Order is specificity.** A case-scoped subject has to be claimed before
     * the catch-all `/cases/{id}/` rule reaches it - reversed, every report
     * and compliance route lands in "Case data".
     */
    it('claims the case-scoped subjects before the catch-all', () => {
      expect(groupOf('/api/cases/{caseId}/reports')).not.toBe('Case data')
      expect(groupOf('/api/cases/{caseId}/compliance')).not.toBe('Case data')
    })

      it('falls back to the resource rather than dropping a route', () => {
      expect(groupOf('/api/something-new')).toBe('Something new')
    })

  })

  describe('no two operations in a group read the same', () => {
    /**
     * Any path ending in something other than the collection or a row id falls
     * through to the plain verb, so `/cases`, `/cases/import` and
     * `/cases/{id}/archive` are one label between them -- "Add to the cases",
     * three times over in the sidebar.
     */
    it.each([
      ['post', '/api/cases/import', 'Import a case'],
      ['post', '/api/cases/{caseId}/reports/{id}/send', 'Send'],
      ['post', '/api/cases/{caseId}/conflicts/resolve', 'Resolve'],
      ['get', '/api/cases/{caseId}/reports/{id}/missing-sections', 'Get the missing sections'],
      ['get', '/api/cases/{id}/compliance/verdict', 'Get the verdict'],
      ['get', '/api/appearance/avatar', 'Get the avatar'],
      ['put', '/api/appearance/avatar', 'Replace the avatar'],
      ['delete', '/api/appearance/avatar', 'Delete the avatar'],
    ])('names %s %s "%s" rather than the plain verb', (method, path, expected) => {
      expect(summarise(method, path, resourceOf(path))).toBe(expected)
    })

    /**
     * The invariant behind those cases: within one heading, a label identifies
     * exactly one operation. A sidebar that repeats itself cannot be navigated.
     *
     * **Real method/path pairs, not their cross product.** Generating all four
     * verbs against every path reports clashes for operations that do not
     * exist - `GET /api/cases/import` is not a route, so it cannot collide with
     * anything.
     */
    it('gives every operation in a group a distinct label', () => {
      const operations: [string, string][] = [
        ['get', '/api/cases'],
        ['post', '/api/cases'],
        ['post', '/api/cases/import'],
        ['get', '/api/cases/{id}'],
        ['patch', '/api/cases/{id}'],
        ['delete', '/api/cases/{id}'],
        ['get', '/api/cases/{caseId}/systems'],
        ['post', '/api/cases/{caseId}/systems'],
        ['post', '/api/cases/{caseId}/systems/bulk'],
        ['patch', '/api/cases/{caseId}/systems/bulk'],
        ['get', '/api/cases/{caseId}/systems/{id}'],
        ['patch', '/api/cases/{caseId}/systems/{id}'],
        ['delete', '/api/cases/{caseId}/systems/{id}'],
      ]
      const labels = new Map<string, string[]>()
      for (const [method, path] of operations) {
        const label = `${groupOf(path) ?? '?'}::${summarise(method, path, resourceOf(path))}`
        labels.set(label, [...(labels.get(label) ?? []), `${method} ${path}`])
      }
      expect([...labels.entries()].filter(([, uses]) => uses.length > 1)).toEqual([])
    })
  })

  describe('which success code carries the body', () => {
    const answers = (path: string, method: string, declared: string) => {
      const out = tidy({
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: {
          [path]: { [method]: { tags: ['X'], responses: { [declared]: { description: '' } } } },
        },
      })
      return (out.paths[path] as Record<string, { responses: Record<string, unknown> }>)[method]!
        .responses
    }

    /**
     * **Nest answers 201 to a POST unless `@HttpCode` says otherwise**, and
     * `@nestjs/swagger` reflects that - so the generated status is the true one
     * and a hardcoded `200` is the invention. An operation carrying both gives
     * a caller testing `status === 200` against a create the wrong answer
     * every time.
     */
    it('attaches a create\u2019s body to the 201 it actually answers', () => {
      const out = answers('/api/cases/{caseId}/systems', 'post', '201')
      expect(out['201']).toHaveProperty('content')
      expect(out['200']).toBeUndefined()
    })

      it('attaches it to the 200 when that is what was declared', () => {
      const out = answers('/api/cases/{caseId}/systems', 'post', '200')
      expect(out['200']).toHaveProperty('content')
      expect(out['201']).toBeUndefined()
    })

    it('never leaves an operation claiming two success codes', () => {
      for (const [declared] of [['200'], ['201']]) {
        const out = answers('/api/cases/{caseId}/systems', 'post', declared!)
        expect(Object.keys(out).filter((code) => code.startsWith('2'))).toHaveLength(1)
      }
    })
  })

  describe('the refusals a caller has to handle', () => {
    const responses = (path: string, method: string) => {
      const out = tidy({
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: { [path]: { [method]: { tags: ['X'], responses: { '200': { description: '' } } } } },
      })
      const op = (out.paths[path] as Record<string, { responses: Record<string, unknown> }>)[method]!
      return Object.keys(op.responses).sort()
    }

    it('documents a validation refusal wherever there is a body', () => {
      expect(responses('/api/cases/{caseId}/systems', 'post')).toContain('400')
    })

    it('documents no validation refusal where there is no body', () => {
      expect(responses('/api/cases/{caseId}/systems', 'get')).not.toContain('400')
    })

    it('documents the missing session on a guarded route', () => {
      expect(responses('/api/cases', 'get')).toContain('401')
    })

    /** The two a probe reaches without signing in must not claim to 401. */
    it.each([['/api/health'], ['/api/openapi.json']])('does not put a 401 on %s', (path) => {
      expect(responses(path, 'get')).not.toContain('401')
    })

    it('documents not-found only where the path names a row', () => {
      expect(responses('/api/cases/{caseId}/systems/{id}', 'get')).toContain('404')
      expect(responses('/api/collections', 'get')).not.toContain('404')
    })

    /**
     * **The 409 is this API's distinctive refusal**, and the one a caller must
     * handle rather than retry: a stale version means a merge review.
     */
    it.each([['patch'], ['delete']])('documents the version conflict on %s', (method) => {
      expect(responses('/api/cases/{caseId}/systems/{id}', method)).toContain('409')
    })

    it('does not claim a version conflict on a read', () => {
      expect(responses('/api/cases/{caseId}/systems/{id}', 'get')).not.toContain('409')
    })

    it('documents a server failure everywhere', () => {
      expect(responses('/api/health', 'get')).toContain('500')
    })

      it('gives the conflict the version the row reached', () => {
      const out = tidy({
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: {
          '/api/cases/{caseId}/systems/{id}': { patch: { tags: ['X'], responses: {} } },
        },
      })
      expect(JSON.stringify(out.paths['/api/cases/{caseId}/systems/{id}']))
        .toContain('currentVersion')
    })
  })

  describe('the resource a path is about', () => {
    it.each([
      ['/api/cases/{caseId}/network_indicators', 'network_indicators'],
      ['/api/cases/{caseId}/evidence/{id}/file', 'evidence'],
      ['/api/cases/{caseId}/reports/{id}/send', 'reports'],
      ['/api/cases/{id}/compliance/verdict', 'compliance'],
      ['/api/cases', 'cases'],
      ['/api/health/resources', 'health'],
      ['/api/recent-cases/{caseId}/pinned', 'recent-cases'],
    ])('reads %s as %s', (path, expected) => {
      expect(resourceOf(path)).toBe(expected)
    })

    /**
     * **The extension is not part of the resource.** `report.docx`, `report.md`
     * and `{collection}.csv` would otherwise each be their own group.
     */
    it.each([
      ['/api/cases/{caseId}/report.docx', 'report'],
      ['/api/openapi.json', 'openapi'],
    ])('drops the extension in %s', (path, expected) => {
      expect(resourceOf(path)).toBe(expected)
    })

    it('puts a sub-resource with its parent', () => {
      expect(resourceOf('/api/cases/{caseId}/evidence/{id}/file'))
        .toBe(resourceOf('/api/cases/{caseId}/evidence'))
    })
  })

  describe('spelling a resource for a reader', () => {
    it.each([
      ['network_indicators', 'Network indicators'],
      ['casenotes', 'Case notes'],
      ['cloud_apps', 'Cloud apps'],
      ['recent-cases', 'Recent cases'],
      ['report_blocks', 'Report blocks'],
    ])('reads %s as %s', (given, expected) => {
      expect(humanise(given)).toBe(expected)
    })
  })

  describe('where the field descriptions come from', () => {
    /**
     * **The app's own labels, not a second vocabulary.** Every entity field
     * carries one already, written by whoever designed the form; Zod 4's
     * `override` hook is what carries it into the document, so nothing here
     * describes a field twice and nothing drifts when a label is reworded.
     */
    it('describes each field from the metadata the forms use', () => {
      const out = published(COLLECTION_SCHEMAS['systems']!) as {
        properties: Record<string, { description?: string }>
      }
      const described = Object.values(out.properties).filter((p) => p.description)
      expect(described.length).toBeGreaterThan(3)
    })

    it('uses the label a field actually declares', () => {
      const out = published(COLLECTION_SCHEMAS['systems']!) as {
        properties: Record<string, { description?: string }>
      }
      const meta = fields.get(COLLECTION_SCHEMAS['systems']!.shape['hostname'])
      expect(out.properties['hostname']?.description).toContain(meta!.label)
    })

    /**
     * **The union publishes, which is why the timeline is in at all.** A
     * timeline entry is an event or an action with different fields, so it
     * cannot be a DTO class - TS2509, the reason it validates through a pipe.
     * `toJSONSchema` renders it as `oneOf`, and a union left unnamed here
     * documents nothing at all.
     */
    it('publishes the timeline union as a choice of shapes', () => {
      const out = published(timelineWriteSchema) as { oneOf?: unknown[]; anyOf?: unknown[] }
      expect((out.oneOf ?? out.anyOf ?? []).length).toBeGreaterThan(1)
    })

    /**
     * **2020-12, because that is what 3.1 is.** A nullable field is
     * `nullable: true` in 3.0 and `anyOf: [..., {type:'null'}]` in 2020-12.
     * Zod hands `nestjs-zod` the newer dialect whatever the document declares,
     * so a document declaring 3.0 carries half its schemas in each and Redocly
     * refuses it. What no test here can see is how a viewer draws it: a
     * dialect it does not expect renders as a union of two anonymous types.
     */
    it('emits the dialect the document declares', () => {
      const said = JSON.stringify(published(COLLECTION_SCHEMAS['cloud_apps']!))
      expect(said).toContain('"type":"null"')
    })
  })

  describe('what a route that is not a collection answers with', () => {
    const at = (path: string, method: string) => {
      const out = tidy({
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: { [path]: { [method]: { tags: ['X'], responses: { '200': { description: '' } } } } },
      })
      return (out.paths[path] as Record<string, Record<string, unknown>>)[method]!
    }

    /**
     * **A download answers with bytes, and saying `application/json` would be
     * worse than saying nothing** - a generator would build a client that
     * parses a Word document as JSON. The media types are read off the
     * handlers, which call `.type('application/pdf')` and friends.
     */
    it.each([
      ['/api/cases/{caseId}/report.pdf', 'application/pdf'],
      ['/api/cases/{caseId}/report.md', 'text/markdown'],
      ['/api/cases/{caseId}/{collection}.csv', 'text/csv'],
    ])('answers %s as %s', (path, media) => {
      const out = at(path, 'get') as {
        responses: Record<string, { content: Record<string, { schema: { format?: string } }> }>
      }
      expect(Object.keys(out.responses['200']!.content)).toEqual([media])
      expect(out.responses['200']!.content[media]!.schema.format).toBe('binary')
    })

    /**
     * **Every operation reaches the refusals, whichever pass claimed it.** A
     * `continue` in one of the response passes takes the 401 and the 500 off
     * every download and install document with it - a regression that appears
     * as an absence and never as a failure.
     */
    it.each([
      ['a download', '/api/cases/{caseId}/report.pdf'],
      ['an install document', '/api/settings'],
    ])('still documents the refusals for %s', (_what, path) => {
      // Not an exact set: a path naming a row also earns a 404, which the
      // download does and the install document does not.
      const answers = Object.keys((at(path, 'get') as { responses: object }).responses)
      expect(answers).toEqual(expect.arrayContaining(['200', '401', '500']))
    })

    it('never gives a download a JSON body as well', () => {
      const out = at('/api/cases/{caseId}/report.pdf', 'get') as {
        responses: Record<string, { content: Record<string, unknown> }>
        requestBody?: unknown
      }
      expect(out.responses['200']!.content['application/json']).toBeUndefined()
      expect(out.requestBody).toBeUndefined()
    })

    /**
     * **Envelopes stay in `openapi.ts`; documents go to their controller.**
     * `{settled: 3}` is one line in a handler and wants no schema file, where
     * `About`, `InstallSettings` and `Resources` are documents whose type and
     * description must not be declared twice - and running one of those through
     * `describe`, which assumes a table, documents operations the API does not
     * offer.
     */
    it.each([
      ['post', '/api/cases/{caseId}/conflicts/resolve', 'settled'],
      ['post', '/api/change-password', 'changed'],
      ['put', '/api/appearance/avatar', 'avatarVersion'],
      ['delete', '/api/appearance/avatar', 'avatarVersion'],
    ])('answers %s %s with an envelope naming %s', (method, path, field) => {
      const out = at(path, method) as {
        responses: Record<string, { content: Record<string, { schema: { properties: object } }> }>
      }
      expect(Object.keys(out.responses['200']!.content['application/json']!.schema.properties))
        .toEqual([field])
    })

    /**
     * **Every install document carries `@ZodResponse`**, so `tidy` adds the
     * refusals and nothing else - the success body arrives from the decorator,
     * which these fixtures do not carry. One mechanism rather than two, and
     * the decorator is the one the compiler can hold a handler to.
     */
    it.each([['/api/about'], ['/api/settings'], ['/api/health/resources']])(
      'leaves %s to its own decorator',
      (path) => {
        const out = at(path, 'get') as { responses: Record<string, { content?: unknown }> }
        expect(out.responses['200']?.content).toBeUndefined()
          expect(Object.keys(out.responses)).toEqual(expect.arrayContaining(['500']))
      },
    )
  })

  describe('the shapes a collection route accepts', () => {
    /**
     * **`responses: { '200': { description: '' } }` is what Nest actually
     * emits, and a fixture saying `{}` hides a defect** - `??=` never fires
     * against an existing empty `200`. Do not simplify it.
     */
    const collection = (path: string, method: string) => {
      const out = tidy({
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: { [path]: { [method]: { tags: ['X'], responses: { '200': { description: '' } } } } },
      })
      return (out.paths[path] as Record<string, Record<string, unknown>>)[method]!
    }

    /**
     * **The whole point of the pass.** The collection routes are inherited
     * from one base class, so a decorator there would give every collection
     * the same shape and without the pass they document no body at all.
     */
    it('documents a POST body from the collection registry', () => {
      const body = collection('/api/cases/{caseId}/systems', 'post') as {
        requestBody: { content: Record<string, { schema: { properties: object } }> }
      }
      expect(Object.keys(body.requestBody.content['application/json']!.schema.properties))
        .toContain('hostname')
    })

    /**
     * **The bulk bodies are envelopes, and both are easy to get wrong.**
     * `POST /bulk` takes `{ entries: [...] }`; `PATCH /bulk` takes
     * `{ ids, fields }` - one patch applied to many rows, not one patch each.
     * Documented as bare arrays, a caller meets a 400 the document said
     * nothing about.
     */
    it('documents a bulk POST as an entries envelope, not an array', () => {
      const body = collection('/api/cases/{caseId}/systems/bulk', 'post') as {
        requestBody: { content: Record<string, { schema: { properties?: Record<string, unknown> } }> }
      }
      const schema = body.requestBody.content['application/json']!.schema
      expect(Object.keys(schema.properties ?? {})).toEqual(['entries'])
    })

    it('documents a bulk PATCH as ids plus one set of fields', () => {
      const body = collection('/api/cases/{caseId}/systems/bulk', 'patch') as {
        requestBody: { content: Record<string, { schema: { properties?: Record<string, unknown> } }> }
      }
      const schema = body.requestBody.content['application/json']!.schema
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual(['fields', 'ids'])
    })

    it.each([
      ['post', '/api/cases/{caseId}/systems', 'hostname'],
      ['patch', '/api/cases/{caseId}/systems/{id}', 'hostname'],
    ])('documents what %s %s answers with', (method, path, field) => {
      const out = collection(path, method) as {
        responses: Record<string, { content: Record<string, { schema: { properties: object } }> }>
      }
      expect(Object.keys(out.responses['200']!.content['application/json']!.schema.properties))
        .toContain(field)
    })

    it('documents the bulk create as answering with ids', () => {
      const out = collection('/api/cases/{caseId}/systems/bulk', 'post') as {
        responses: Record<
          string,
          { content: Record<string, { schema: { properties?: Record<string, unknown> } }> }
        >
      }
      expect(Object.keys(out.responses['200']!.content['application/json']!.schema.properties ?? {}))
        .toEqual(['ids'])
    })

    it('documents the delete as answering a flag', () => {
      const out = collection('/api/cases/{caseId}/systems/{id}', 'delete') as {
        responses: Record<
          string,
          { content: Record<string, { schema: { properties?: Record<string, unknown> } }> }
        >
      }
      expect(Object.keys(out.responses['200']!.content['application/json']!.schema.properties ?? {}))
        .toEqual(['deleted'])
    })

    it('documents a PATCH body with nothing required', () => {
      const body = collection('/api/cases/{caseId}/systems/{id}', 'patch') as {
        requestBody: { content: Record<string, { schema: { required?: string[] } }> }
      }
      expect(body.requestBody.content['application/json']!.schema.required ?? []).toEqual([])
    })

    it('documents the list response as an array and the row response as one', () => {
      const list = collection('/api/cases/{caseId}/systems', 'get') as {
        responses: Record<string, { content: Record<string, { schema: { type?: string } }> }>
      }
      const row = collection('/api/cases/{caseId}/systems/{id}', 'get') as {
        responses: Record<string, { content: Record<string, { schema: { type?: string } }> }>
      }
      expect(list.responses['200']!.content['application/json']!.schema.type).toBe('array')
      expect(row.responses['200']!.content['application/json']!.schema.type).not.toBe('array')
    })

    it('leaves a route that is not a collection alone', () => {
      expect(collection('/api/health', 'get').requestBody).toBeUndefined()
    })
  })

  it('lists no group whose only paths were dropped', () => {
    expect(built().tags?.map((t) => t.name)).not.toContain('Spa')
  })

  /**
   * **Imperative and resource-first**, which is what Microsoft Graph and
   * Elastic both do - and what it does, not where it is: `METHOD /path` is the
   * string Swagger UI already prints beside every row.
   */
  it.each([
    ['get', '/api/cases/{caseId}/systems', 'List systems'],
    ['get', '/api/cases/{caseId}/systems/{id}', 'Get a system'],
    ['post', '/api/cases/{caseId}/systems', 'Create a system'],
    ['post', '/api/cases/{caseId}/systems/bulk', 'Create systems in bulk'],
    ['patch', '/api/cases/{caseId}/systems/{id}', 'Update a system'],
    ['delete', '/api/cases/{caseId}/systems/{id}', 'Delete a system'],
  ])('summarises %s %s as "%s"', (method, path, expected) => {
    expect(summarise(method, path, resourceOf(path))).toBe(expected)
  })

  it.each([
    ['malware', 'Get a malware entry'],
    ['impact', 'Get an impact entry'],
    ['evidence', 'Get an evidence item'],
    ['casenotes', 'Get a case note'],
    ['accounts', 'Get an account'],
  ])('singularises %s correctly', (resource, expected) => {
    expect(summarise('get', `/api/cases/{caseId}/${resource}/{id}`, resource)).toBe(expected)
  })

  it('falls back to method and path when there is no resource', () => {
    expect(summarise('get', '/api/thing', undefined)).toBe('GET /api/thing')
  })

  it('leaves a summary somebody wrote alone', () => {
    const out = tidy({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: { '/api/x': { get: { tags: ['X'], summary: 'Raise a case', responses: {} } } },
    })
    expect((out.paths['/api/x'] as Record<string, { summary: string }>)['get']?.summary)
      .toBe('Raise a case')
  })
})

describe('serving the document', () => {
  it('answers 404 rather than an empty document when none was built', () => {
    // **An empty `{paths:{}}` reads as "this API has no routes"**, which a
    // client generator consumes happily and silently produces nothing from.
    // Nothing fills the store in the REPL or in a module built without main.ts.
    const controller = new OpenApiController(new OpenApiStore())
    expect(() => controller.read()).toThrow(NotFoundException)
  })

  it('serves the document once one is stored', () => {
    const store = new OpenApiStore()
    const document = { openapi: '3.0.0', info: { title: 'x', version: '1' }, paths: {} }
    store.set(document)
    expect(new OpenApiController(store).read()).toBe(document)
  })
})

/** Redocly cannot see these: the result is a valid 3.0 array either way. */
describe('a tuple lowered for OpenAPI 3.0', () => {
  const lowered = (positions: Record<string, unknown>[]): Record<string, unknown> => {
    const out = tidy({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: { schemas: { Thing: { type: 'array', prefixItems: positions } } },
    } as never) as unknown as {
      components: { schemas: { Thing: Record<string, unknown> } }
    }
    return out.components.schemas.Thing
  }

  it('keeps the length and drops the 2020-12 keyword', () => {
    const out = lowered([{ type: 'number' }, { type: 'number' }, { type: 'number' }])

    expect(out['prefixItems']).toBeUndefined()
    expect(out['minItems']).toBe(3)
    expect(out['maxItems']).toBe(3)
    expect(out['items']).toEqual({ type: 'number' })
  })

  it('carries every position s type when they differ, not the first', () => {
    const out = lowered([{ type: 'string' }, { type: 'number' }])

    expect(out['items']).toEqual({ anyOf: [{ type: 'string' }, { type: 'number' }] })
  })

  it('leaves items open when no position declares a type', () => {
    const out = lowered([{ description: 'a ref' }, {}])

    expect(out['items']).toEqual({})
    expect(out['minItems']).toBe(2)
  })
})
