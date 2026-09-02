/**
 * Asserts where code lives: that every relative import resolves, that a folder
 * only reaches the folders `MAY_IMPORT` grants it, and that every route
 * declares a response schema.
 *
 * Reads the source text and never imports a module, so it needs no database
 * and asserts nothing about runtime behaviour.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)))

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return name.endsWith('.ts') ? [path] : []
  })
}

/** Relative import specifiers in one file, as written. */
function imports(path: string): string[] {
  const text = readFileSync(path, 'utf8')
  return [...text.matchAll(/from '(\.[^']*)'/g)].map((match) => match[1]!)
}

/** The top-level folder a path sits in, or `''` for a file directly in `src`. */
function layer(path: string): string {
  const rel = relative(SRC, path)
  return rel.includes('/') ? rel.split('/')[0]! : ''
}

const FILES = sources()

describe('every relative import resolves', () => {
  /**
   * Imports are written `.js` and the sources are `.ts`, so both spellings are
   * tried; a directory counts as resolved, since a folder import means its
   * `index`. Stat-ing the literal specifier would call the whole tree broken.
   */
  it.each(FILES.map((f) => [relative(SRC, f), f]))('%s', (_name, path) => {
    for (const spec of imports(path)) {
      const base = resolve(dirname(path), spec)
      const candidates = [
        base.endsWith('.js') ? `${base.slice(0, -'.js'.length)}.ts` : `${base}.ts`,
        base,
        join(base, 'index.ts'),
      ]
      const found = candidates.some((candidate) => {
        try {
          return statSync(candidate).isFile() || statSync(candidate).isDirectory()
        } catch {
          return false
        }
      })
      expect(found, `${relative(SRC, path)} imports ${spec}, which is nowhere`).toBe(true)
    }
  })
})

/**
 * The folders each layer may reach, keyed by folder name.
 *
 * An entry grants the forward edge only; the reverse edge stays forbidden by
 * its absence, which is the property every one of these lists is protecting.
 */
const MAY_IMPORT: Record<string, string[]> = {
  domain: [],
  db: ['config'],
  config: [],
  demos: ['db', 'domain', 'config'],
  auth: ['db', 'config', 'install-activity', 'policy'],
  cases: ['db', 'domain', 'demos', 'library', 'config', 'access', 'live', 'install-activity'],
  collections: ['db', 'domain', 'config', 'live', 'access', 'evidence', 'report'],
  /** No `cases`: one row per case, scoped by the `caseId` in the URL alone. */
  // `customers` for the organisation facts alone: a case copies them when
  // its compliance row is raised, and reports which have since moved.
  compliance: ['db', 'domain', 'config', 'live', 'access', 'preferences', 'customers'],
  exports: ['db', 'domain', 'config', 'collections', 'access', 'wire'],
  specs: ['domain'],
  /** Install-level: a template is what a *new* case starts from, so no `caseId`. */
  // `auth` for `AdminOnly` on `PUT /api/library/{slug}` alone: replacing a
  // whole kind can disable a shipped built-in, which no per-entry route
  // offers. The per-entry writes need nothing from `auth`.
  library: ['db', 'domain', 'auth', 'install-activity'],
  /** Install-level, and reads nothing else: a customer is a record on its own. */
  customers: ['db'],
  recent: ['db', 'auth', 'access'],
  /**
   * Not `db`: every account write goes through Better Auth's admin plugin.
   * `install-activity` is the audit line each of those writes owes, and it
   * holds the handle so this folder still does not.
   */
  accounts: ['auth', 'install-activity'],
  /**
   * A leaf above `db`: it appends a row and reads nothing back.
   *
   * **No `auth`, and that is what forced the reader into its own folder.**
   * `auth` imports this one - Better Auth's hooks record a sign-in - so an
   * edge back the other way is a cycle. -> `install-audit`
   */
  // A leaf on purpose: the settings route writes these and the controls
  // they bound read them, and those two folders already point one way.
  policy: ['db', 'config'],
  'install-activity': ['db'],
  // The guard records its own refusals, so it reaches the writer and the
  // database - and nothing else. A rate limit that grew a dependency on a
  // feature folder would be a limit that could not be applied before that
  // feature was built.
  throttle: ['db', 'auth', 'install-activity'],
  /** Above `auth`, because reading the audit is admin-gated. */
  'install-audit': ['db', 'auth', 'install-activity', 'preferences', 'policy'],
  /** A leaf: the certificate is materialised before the Nest container exists. */
  tls: [],
  report: [
    'domain',
    'library',
    'db',
    'access',
    'cases',
    'prose',
    'live',
    'auth',
    'evidence',
    'install-activity',
  ],
  'demo-reports': ['db', 'domain', 'demos', 'report', 'cases', 'config'],
  /**
   * Above the features, and the edges say why: it maps a vendor payload onto
   * `domain` schemas, writes through `collections`, and opens a new case
   * through `cases` for the door that starts one from an incident.
   */
  'incident-import': ['db', 'domain', 'collections', 'cases', 'access'],
  // `auth` for `AdminOnly` and `install-activity` for the line every
  // install-level write owes: granting reach is managing the install.
  access: ['db', 'auth', 'install-activity'],
  wire: [],
  /** A pure transformation of bytes: it knows an archive's members, not a case. */
  archive: [],
  'case-archive': ['db', 'archive', 'cases', 'evidence', 'access', 'domain'],
  brand: [],
  /** Bytes on disk. It knows where they go and nothing about a case. */
  evidence: ['config', 'policy'],
  preferences: ['db', 'config', 'auth', 'domain', 'install-activity', 'policy'],
  /** No `live`: the socket knows about documents, never the reverse. */
  prose: ['db', 'config'],
  // `access` because no guard runs on an upgrade: the socket asks the same
  // reach question a route's guard does, by hand. -> `live.gateway.ts`
  live: ['auth', 'db', 'config', 'prose', 'install-activity', 'access'],
  /**
   * `db` is one connection, not a query tier: readiness runs `select 1` on the
   * pool the app serves from, so a pool with nothing free reads as unhealthy.
   *
   * `domain` for About alone, which moved in here when it stopped being a rail
   * entry and became a dialog: its response shape is `domain/about.ts`, and a
   * controller declaring what it publishes reaches the schema tier the same way
   * `library`, `report`, `preferences` and three others do. The alternative was
   * a second copy of the schema outside `domain`, which is what that tier
   * exists to prevent.
   */
  health: ['config', 'evidence', 'archive', 'db', 'domain'],
  spa: ['config'],
  test: ['db', 'config'],
}

/** Tests are outside the layering rule: nothing imports one, so none can cycle. */
const isTest = (path: string) => path.endsWith('.test.ts')

describe('the layers only reach downwards', () => {
  /**
   * Enumerates the folders on disk, not `MAY_IMPORT`'s keys: a folder absent
   * from the map is exempt from the sweep below rather than failing it.
   */
  it('has a rule for every folder', () => {
    const folders = [
      ...new Set(FILES.map((f) => layer(f)).filter((name) => name !== '')),
    ].sort()
    const unruled = folders.filter((name) => !(name in MAY_IMPORT))

    expect(unruled, 'a folder with no entry is exempt rather than checked').toEqual([])
  })

  it.each(Object.keys(MAY_IMPORT))('%s', (from) => {
    const allowed = new Set([from, ...MAY_IMPORT[from]!])
    for (const path of FILES.filter((f) => layer(f) === from && !isTest(f))) {
      for (const spec of imports(path)) {
        const target = layer(resolve(dirname(path), spec))
        if (target === '') continue // a file directly in src/, for example app.module
        expect(
          allowed.has(target),
          `${relative(SRC, path)} imports ${target}/, which ${from}/ may not reach`,
        ).toBe(true)
      }
    }
  })
})

describe('the folders keep their shape', () => {
  /**
   * Catches what the layering rule cannot: a transport file that imports
   * nothing sits in `domain/` without reaching for anything it may not.
   */
  it('keeps controllers, modules and guards out of domain/', () => {
    const strays = FILES.filter((f) => layer(f) === 'domain').filter((f) =>
      /\.(controller|module|guard|service)\.ts$/.test(f),
    )
    expect(strays.map((f) => relative(SRC, f))).toEqual([])
  })

  /**
   * A folder whose files repeat its own name reads as `demos/demo-content`,
   * which is how the Python tree ended up with `picker/picker_*.py`.
   */
  it('does not repeat a folder name in its own files', () => {
    const repeats = FILES.filter((f) => {
      const folder = layer(f)
      if (!folder) return false
      const name = relative(SRC, f).split('/').pop()!
      // `cases/cases.controller.ts` is Nest's own convention for the module's
      // namesake and is not the smell; `demos/content.ts` was.
      return name.startsWith(`${folder.replace(/s$/, '')}-`)
    })
    expect(repeats.map((f) => relative(SRC, f))).toEqual([])
  })
})

/**
 * Every route answering with JSON carries a `@ZodResponse`, except the
 * controllers named in `NO_JSON_BODY`.
 *
 * Counts decorators in the source text, so it sees whether a route declares
 * *a* schema and never whether the schema is the right one.
 */
describe('every route declares what it answers with', () => {
  /** Routes with no JSON body to describe. Each entry names why. */
  const NO_JSON_BODY: Readonly<Record<string, string>> = {
    'spa/spa.controller.ts': 'serves index.html for every unmatched path',
    'docs.controller.ts': 'serves the API reference as HTML',
    'report/export.controller.ts': 'streams .docx and .md as files',
    'collections/evidence-file.controller.ts': 'streams a stored artefact',
    'brand/brand.controller.ts': 'streams the brand assets',
    'health/health.controller.ts': 'a liveness probe, answered before the app is up',
  }

  /** Strips comments, so a route decorator quoted in prose is not counted. */
  const withoutComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  const CONTROLLERS = FILES.filter(
    (path) => path.endsWith('.controller.ts') && !path.endsWith('.test.ts'),
  )

  it('has a controller to check, so an empty sweep cannot pass', () => {
    // Without this the whole describe is vacuous the moment the glob breaks.
    expect(CONTROLLERS.length).toBeGreaterThan(20)
  })

  it('puts a response schema on every route that answers with JSON', () => {
    const missing: string[] = []
    for (const path of CONTROLLERS) {
      const rel = relative(SRC, path)
      if (rel in NO_JSON_BODY) continue
      const text = withoutComments(readFileSync(path, 'utf8'))
      const routes = [...text.matchAll(/@(?:Get|Post|Patch|Put|Delete)\(/g)].length
      const declared = [...text.matchAll(/@ZodResponse\(/g)].length
      // **A handler taking `@Res()` writes the response itself** - a file
      // download, a redirect, a rendered page - so there is no JSON body to
      // describe. Read off the handler rather than the exemption list below,
      // because it is a property of the route and stays true when one is added.
      const streamed = [...text.matchAll(/@Res\(/g)].length
      // **A route that sets a non-JSON content type is answering with a
      // document, not an object** - a CSV export is a string body, and a schema
      // for it would describe the wrong thing entirely.
      const typed = [...text.matchAll(/@Header\('content-type', '(?!application\/json)/g)].length
      // **A handler declared `Promise<void>` sends no body at all.** Declaring
      // an empty object for it would make the interceptor parse `undefined`.
      const empty = [...text.matchAll(/\): Promise<void> \{/g)].length
      const owed = routes - streamed - typed - empty
      if (owed > declared) missing.push(`${rel}: ${String(owed - declared)} of ${String(owed)}`)
    }
    expect(missing).toEqual([])
  })

  it('claims no exemption for a controller that does not exist', () => {
    // An exemption outliving its file is how the list stops meaning anything.
    const known = new Set(CONTROLLERS.map((path) => relative(SRC, path)))
    expect(Object.keys(NO_JSON_BODY).filter((name) => !known.has(name))).toEqual([])
  })
})
