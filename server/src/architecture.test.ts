/**
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

function imports(path: string): string[] {
  const text = readFileSync(path, 'utf8')
  return [...text.matchAll(/from '(\.[^']*)'/g)].map((match) => match[1]!)
}

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
 *
 * **`domain` reaches nothing, so an edge into it can never become a cycle.**
 * It is the wire's own vocabulary, read by the client as `@contract` as well,
 * and the reason a folder lists it is always the same one: a word the browser
 * has to know is described there rather than beside the code that serves it.
 */
const MAY_IMPORT: Record<string, string[]> = {
  domain: [],
  db: ['config'],
  config: [],
  // `customers` for the same reason `cases` has it: a demo raises cases, and a
  // case is opened under a customer.
  demos: ['db', 'domain', 'config', 'customers'],
  /**
   * `wire` for the one decision three folders share: whether the caller's
   * claimed address may be believed. It is a leaf, so the edge cannot become
   * a cycle, and the alternative to the edge is each folder deciding for
   * itself - which is the defect it replaces. -> `wire/caller-address.ts`
   */
  auth: ['db', 'domain', 'config', 'install-activity', 'policy', 'wire'],
  // `customers` because a case is opened *under* one: the door that raises a
  // case has to know which, and a reference is unique within it. The reverse
  // edge stays absent -- a customer knows nothing about cases.
  cases: [
    'db',
    'domain',
    'demos',
    'library',
    'config',
    'access',
    'live',
    'install-activity',
    'customers',
  ],
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
  // `auth` for `AdminOnly` and `install-activity` for the line every
  // install-level write owes: keeping the directory is managing the install.
  customers: ['db', 'auth', 'install-activity', 'domain'],
  recent: ['db', 'auth', 'access'],
  /**
   * Not `db`: every account write goes through Better Auth's admin plugin.
   * `install-activity` is the audit line each of those writes owes, and it
   * holds the handle so this folder still does not.
   */
  accounts: ['auth', 'domain', 'install-activity'],
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
  // Still appends a row and reads nothing back. `wire` is the address rule,
  // and this folder already takes `IncomingHttpHeaders` from its callers, so
  // the edge adds a shared decision rather than a new awareness.
  'install-activity': ['db', 'wire'],
  // The guard records its own refusals, so it reaches the writer and the
  // database - and no *feature* folder, which is the edge that would make a
  // rate limit unappliable until that feature was built. `wire` is a leaf
  // holding the address rule this shares with the audit and Better Auth.
  throttle: ['db', 'auth', 'install-activity', 'wire'],
  /** Above `auth`, because reading the audit is admin-gated. */
  'install-audit': ['db', 'auth', 'install-activity', 'preferences', 'policy', 'config', 'domain'],
  /** A leaf: the certificate is materialised before the Nest container exists. */
  tls: [],
  // `preferences` for the install's regime switches alone: `library`'s
  // specification says an install that does not assess against a regime must
  // not be *offered* the layouts for reporting under it, so the route that
  // serves them has to know which regimes the install assesses. -> #200
  report: [
    'domain',
    'library',
    'db',
    'access',
    'preferences',
    'cases',
    'prose',
    'live',
    'auth',
    'evidence',
    'install-activity',
  ],
  'demo-reports': ['db', 'domain', 'demos', 'report', 'cases', 'config'],
  /**
   * Reaches the controllers whose answers it captures, which is why it is not
   * in `demos/`: widening that folder to `health`, `report` and `specs` closes
   * a cycle, since `cases` imports `demos` and `report` imports `cases`.
   *
   * Nothing in `src/` imports this one, so the edges cannot become cycles.
   */
  // `library` for the built-ins: the demo's library is what a fresh install
  // holds, and those are constants in that folder rather than rows in a table.
  'demo-catalogue': ['domain', 'demos', 'health', 'library', 'report', 'specs'],
  /**
   * Above the features, and the edges say why: it maps a vendor payload onto
   * `domain` schemas, writes through `collections`, and opens a new case
   * through `cases` for the door that starts one from an incident.
   */
  'incident-import': ['db', 'domain', 'collections', 'cases', 'access'],
  // `auth` for `AdminOnly` and `install-activity` for the line every
  // install-level write owes: granting reach is managing the install.
  access: ['db', 'domain', 'auth', 'install-activity'],
  // `domain` for the refusal body: the shape is the contract the client's
  // reader answers to, and the folders that raise their own pipe may not reach
  // `wire`. The edge is to a leaf, so it cannot become a cycle.
  wire: ['domain'],
  /** A pure transformation of bytes: it knows an archive's members, not a case. */
  archive: [],
  /**
   * `policy` because both of its doors are bounded by an install setting: the
   * passphrase an archive is sealed with, and how large one may be. They held
   * constants of their own until #588, which is how the settings came to be
   * offered and read by nothing.
   */
  // `customers` for the same reason `cases` has it: reading an archive opens a
  // case, and a case is opened under a customer.
  'case-archive': [
    'db',
    'archive',
    'cases',
    'evidence',
    'access',
    'domain',
    'policy',
    'customers',
  ],
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
   * `domain` for About alone: its response shape is `domain/about.ts`, and a
   * controller declaring what it publishes reaches the schema tier the same way
   * `library`, `report`, `preferences` and three others do. The alternative is a
   * second copy of the schema outside `domain`, which is what that tier exists
   * to prevent.
   *
   * `policy` for the limits it states: the screen reported the compile-time
   * constants, so it agreed with the code while both disagreed with the
   * setting an operator had changed. -> #588
   */
  // `auth` for `AdminOnly` on the two telemetry routes alone: what the install
  // is made of is an operator's, and the liveness probe beside them stays open.
  health: ['config', 'db', 'domain', 'policy', 'auth'],
  spa: ['config'],
  test: ['db', 'config'],
}

/** Tests are outside the layering rule: nothing imports one, so none can cycle. */
const isTest = (path: string) => path.endsWith('.test.ts')

/**
 * The first loop `MAY_IMPORT` admits, as the path that closes it.
 *
 * Depth-first over the map rather than over the imports on disk: an edge is
 * added here before the import that uses it, so this refuses the entry rather
 * than the file.
 */
function loopIn(graph: Record<string, string[]>): string[] | null {
  const open = new Set<string>()
  const done = new Set<string>()

  const walk = (name: string, path: string[]): string[] | null => {
    open.add(name)
    for (const next of graph[name] ?? []) {
      if (open.has(next)) return [...path.slice(path.indexOf(next)), next]
      if (!done.has(next)) {
        const found = walk(next, [...path, next])
        if (found) return found
      }
    }
    open.delete(name)
    done.add(name)
    return null
  }

  for (const name of Object.keys(graph)) {
    if (done.has(name)) continue
    const found = walk(name, [name])
    if (found) return found
  }
  return null
}

describe('the layers only reach downwards', () => {
  /**
   * **Six entries above argue a particular edge cannot close a loop**, and the
   * sweep below only checks that an import is allowed. So an entry admitting
   * one passes, and the property those comments defend is held by whoever is
   * editing the map. -> #1010
   */
  it('admits no loop, so an edge can be read as reaching downwards', () => {
    expect(loopIn(MAY_IMPORT)?.join(' -> ') ?? null).toBeNull()
  })

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
   * where the folder has already said it.
   */
  it('does not repeat a folder name in its own files', () => {
    const repeats = FILES.filter((f) => {
      const folder = layer(f)
      if (!folder) return false
      const name = relative(SRC, f).split('/').pop()!
      // `cases/cases.controller.ts` is Nest's own convention for the module's
      // namesake and is not the smell; `demos/demo-content.ts` would be.
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
    const known = new Set(CONTROLLERS.map((path) => relative(SRC, path)))
    expect(Object.keys(NO_JSON_BODY).filter((name) => !known.has(name))).toEqual([])
  })
})
