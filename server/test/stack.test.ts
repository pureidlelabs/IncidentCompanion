/**
 * The one derivation of a worktree's ports, asserted through the interface
 * both consumers use.
 */
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { declined } from './must-run.js'

const SCRIPT = new URL('../scripts/stack.mjs', import.meta.url).pathname

/** The ceiling `stack.mjs` refuses past, restated so the reclaim case can fill it. */
const MAX_SLOT = 40

const made: string[] = []

afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

/** A checkout on disk. `.git` is a directory in the main one, a file in a worktree. */
function checkout(name: string, kind: 'main' | 'worktree'): string {
  const base = mkdtempSync(join(tmpdir(), 'ic-stack-'))
  made.push(base)
  const root = join(base, name)
  mkdirSync(root, { recursive: true })
  if (kind === 'main') mkdirSync(join(root, '.git'))
  else writeFileSync(join(root, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n')
  return root
}

/**
 * What a case that spawns the script forty times may take.
 */
const SPAWN_BUDGET = 30_000

/** One `stack.mjs` run as a promise, so several can be in flight at once. */
function runNode(args: string[], extra: Record<string, string>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      'node',
      [SCRIPT, ...args],
      { encoding: 'utf8', env: { ...process.env, ...extra } },
      (error, stdout) => {
        // **`instanceof` because the type cannot prove what the runtime
        // guarantees.** `execFile`'s callback gives an `ExecFileException`,
        // declared as `extends Omit<NodeJS.ErrnoException, 'code'>` -- and
        // `Omit` produces a plain object type, so the `Error` relationship is
        // gone and `prefer-promise-reject-errors` is right to refuse it. The
        // value is an `Error` every time; this is what says so in the types.
        if (error) reject(error instanceof Error ? error : new Error(error.message))
        else resolve(stdout)
      },
    )
  })
}

function stack(root: string, registry: string): Record<string, string | number> {
  const out = execFileSync('node', [SCRIPT, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, IC_STACK_ROOT: root, IC_STACK_REGISTRY: registry },
  })
  return JSON.parse(out) as Record<string, string | number>
}

/** A registry of its own, so one test's allocations are not another's. */
function freshRegistry(): string {
  const base = mkdtempSync(join(tmpdir(), 'ic-reg-'))
  made.push(base)
  return join(base, 'slots.json')
}

describe('the per-worktree stack derivation', () => {
  const registry = freshRegistry()

  it('leaves the main checkout on the documented ports', () => {
    // The maintainer's own stack keeps the numbers written in compose.dev.yaml and
    // in every note; a worktree is what moves.
    const main = stack(checkout('IncidentCompanion', 'main'), registry)
    expect(main['slot']).toBe(0)
    expect(main['pgPort']).toBe(55432)
    expect(main['redisPort']).toBe(56379)
    expect(main['apiPort']).toBe(8124)
    expect(main['vitePort']).toBe(5173)
  })

  it('gives the same worktree the same ports every time', () => {
    // **Deterministic, not "next free".** An agent has to know where its own
    // app is without reading a log, and a port that moves between runs makes
    // every recorded URL wrong.
    const root = checkout('nest-next', 'worktree')
    const first = stack(root, registry)
    const second = stack(root, registry)
    expect(second).toEqual(first)
    expect(first['slot']).not.toBe(0)
  })

  it('gives two worktrees five different ports each', () => {
    const a = stack(checkout('alpha', 'worktree'), registry)
    const b = stack(checkout('beta', 'worktree'), registry)
    const ports = (s: Record<string, string | number>) => [
      s['pgPort'],
      s['redisPort'],
      s['apiPort'],
      s['vitePort'],
      s['storybookPort'],
    ]
    expect(new Set([...ports(a), ...ports(b)]).size).toBe(10)
  })

  it('never lets one family land on another family s port, over every slot', () => {
    // The five bases are non-congruent mod the stride, which is what makes
    // this true for every slot rather than for the ones somebody tried. Runs
    // the registry to its limit, so it owns one.
    const full = freshRegistry()
    const seen = new Set<number>()
    for (let n = 0; n < 40; n += 1) {
      const s = stack(checkout(`slug${n}`, 'worktree'), full)
      for (const key of ['pgPort', 'redisPort', 'apiPort', 'vitePort', 'storybookPort']) {
        const port = s[key] as number
        expect(seen.has(port), `${key} ${port} is already some other stack s`).toBe(false)
        seen.add(port)
        expect(port).toBeGreaterThan(1024)
        expect(port).toBeLessThan(65536)
      }
    }

    // **The 41st is refused rather than wrapped.** Silently reusing slot 1
    // would hand two worktrees one stack, which is the whole failure this
    // file exists to prevent - and it would look like a working start.
    expect(() => stack(checkout('one-too-many', 'worktree'), full)).toThrow(
      /No stack slot left/,
    )
  }, SPAWN_BUDGET)

  it('reclaims a removed worktree s slot rather than refusing the next one', () => {
    /**
     * **`git worktree remove` knows nothing about this registry**, so without
     * reclaiming, a laptop that has churned through forty throwaway worktrees
     * cannot start a stack at all and the error blames the registry rather
     * than the removals.
     */
    const full = freshRegistry()
    const made: string[] = []
    for (let n = 0; n < MAX_SLOT; n += 1) made.push(checkout(`filler${n}`, 'worktree'))
    for (const root of made) stack(root, full)

    rmSync(made[0]!, { recursive: true, force: true })

    const fresh = stack(checkout('arrived-after', 'worktree'), full) as { slot: number }
    expect(fresh.slot).toBeGreaterThan(0)
    // And the dead entry leaves the file, rather than being ignored in place.
    const written = JSON.parse(readFileSync(full, 'utf8')) as Record<string, number>
    expect(Object.keys(written)).not.toContain(made[0])
  }, SPAWN_BUDGET)

  it('does not sweep a registry that still has room', () => {
    /**
     * **The reclaim is asked last, and this is the direction that matters.**
     */
    const full = freshRegistry()
    const gone = checkout('removed-later', 'worktree')
    const first = stack(gone, full) as { slot: number }
    rmSync(gone, { recursive: true, force: true })

    const next = stack(checkout('arrived-after', 'worktree'), full) as { slot: number }
    expect(next.slot).not.toBe(first.slot)
    const written = JSON.parse(readFileSync(full, 'utf8')) as Record<string, number>
    expect(Object.keys(written)).toContain(gone)
  })

  it('keeps the slot of a worktree that is still there', () => {
    // Reclaiming is about *absence*, and a live worktree losing its ports to a
    // neighbour is the failure this whole file exists to prevent.
    const full = freshRegistry()
    const alive = checkout('still-here', 'worktree')
    const before = stack(alive, full) as { slot: number }
    stack(checkout('a-neighbour', 'worktree'), full)
    const after = stack(alive, full) as { slot: number }
    expect(after.slot).toBe(before.slot)
  })

  it('gives eight simultaneous worktrees eight different slots', async () => {
    /**
     * **The claim with the highest consequence and, until this, no test.**
     */
    const shared = freshRegistry()
    const roots = Array.from({ length: 8 }, (_, at) => checkout(`racer${at}`, 'worktree'))
    // **Awaited together, not in a loop.** `execFileSync` in a `map` runs them
    // one after another, which is the sequential case already covered above
    // and cannot fail the way this one can.
    const running = await Promise.all(
      roots.map((root) =>
        runNode(['--json'], { IC_STACK_ROOT: root, IC_STACK_REGISTRY: shared }),
      ),
    )
    const slots = running.map((out) => (JSON.parse(out) as { slot: number }).slot)

    expect(new Set(slots).size, `slots were ${slots.join(', ')}`).toBe(roots.length)
    // And the registry describes every one of them: the losing writer used to
    // erase the winner's entry, so a slot could be handed out twice later.
    const registry = JSON.parse(readFileSync(shared, 'utf8')) as Record<string, number>
    expect(Object.keys(registry)).toHaveLength(roots.length)
  })

  it('refuses a remembered slot that is not one, rather than multiplying it into a port', () => {
    // The registry is a file: hand-edited, truncated or written by an older
    // build. A slot of 9999 read back verbatim gave port 1055332, and -5 gave
    // 54932 - both outside anything this scheme reserves.
    const registry = freshRegistry()
    const root = checkout('rememberer', 'worktree')
    writeFileSync(registry, JSON.stringify({ [root]: 9999 }))

    const s = stack(root, registry)
    expect(s['slot']).not.toBe(9999)
    expect(s['pgPort'] as number).toBeLessThan(65536)
  })

  it('keeps two worktrees of the same name apart', () => {
    // `.claude/worktrees/<name>` makes a repeat unlikely and not impossible,
    // and the script's own docstring invites a worktree kept elsewhere. Keyed
    // on the basename, both got one slot - deterministically, so every retry
    // reproduced it.
    const registry = freshRegistry()
    const a = stack(checkout('api', 'worktree'), registry)
    const b = stack(checkout('api', 'worktree'), registry)
    expect(a['apiPort']).not.toBe(b['apiPort'])
    // **And the compose project, which asserting only the ports missed.**
    // Compose identifies a container by project plus service, so a shared
    // project means the second `up` recreates the first's containers and one
    // `down` removes both - with each tree believing it has its own stack.
    expect(a['project']).not.toBe(b['project'])
  })

  it('names a test database that global-setup will accept', () => {
    // `global-setup.ts` refuses any database not ending in `_test`, and that
    // refusal is the only thing standing between a suite and the dev data.
    const s = stack(checkout('gamma', 'worktree'), registry)
    expect(new URL(String(s['testDatabaseUrl'])).pathname).toMatch(/_test$/)
    expect(String(s['testDatabaseUrl'])).toContain(`:${String(s['pgPort'])}/`)
  })

  it('scopes the compose project so one worktree s down leaves the others up', () => {
    const a = stack(checkout('delta', 'worktree'), registry)
    const b = stack(checkout('epsilon', 'worktree'), registry)
    expect(a['project']).not.toBe(b['project'])
  })

  it('reduces a directory name to something compose will take as a project', () => {
    // A directory name is not a project name. Compose refuses anything outside
    // [a-z0-9_-] and a rejected project silently becomes the *default* one,
    // which is the shared stack this whole file exists to stop sharing.
    const s = stack(checkout('has.dots-and-CAPS', 'worktree'), registry)
    expect(String(s['project'])).toMatch(/^[a-z0-9][a-z0-9_-]*$/)
  })

  /**
   * **`--roles` against the live cluster, because nothing else exercises it.**
   */
  it('creates the three roles the app connects as', (ctx) => {
    // **From the script, not from this file's fixture registry.** Built with
    // the test helper it named a project no container has, so the guard below
    // always fired and the whole case skipped in silence - green with the roles
    // mode broken, which a break-verify caught and nothing else would have.
    const real = spawnSync('node', [SCRIPT], { encoding: 'utf8' })
    if (real.status !== 0) {
      declined('The roles mode', `${SCRIPT} exited ${String(real.status)}`, {
        needsAComposeStack: true,
      })
      return ctx.skip()
    }
    const project = String((JSON.parse(real.stdout) as Record<string, unknown>)['project'])

    const up = spawnSync('docker', ['compose', '-p', project, 'ps', '-q', 'postgres'], {
      encoding: 'utf8',
    })
    // **`ctx.skip()`, not a bare `return`.** A silent return is indistinguishable
    // from a pass in the reporter, and this case is the only thing that
    // exercises `--roles` -- so when `roles.sql` moved on 2026-08-16 and the
    // mode broke, this reported green and the defect reached review. A skip is
    // visible; a return is a claim that the assertions ran.
    if (up.status !== 0 || up.stdout.trim() === '') {
      // **`needsAComposeStack`, because CI has no compose project at all.**
      // `server-suite` raises Postgres and Redis as GitHub service containers,
      // so this looks for a project that was never created and finds nothing.
      // Armed on `CI`, that ejected this branch from the merge queue three
      // times. `verify.sh --detailed` is the run that does raise a stack, and
      // is the one whose verdict this case is worth failing.
      declined('The roles mode', `no postgres container is up for project ${project}`, {
        needsAComposeStack: true,
      })
      return ctx.skip()
    }

    expect(
      spawnSync('node', [SCRIPT, '--roles'], { encoding: 'utf8' }).status,
      'the roles step failed',
    ).toBe(0)

    const found = spawnSync(
      'docker',
      ['compose', '-p', project, 'exec', '-T', 'postgres', 'psql', '-U', 'incidentcompanion',
       '-d', 'incidentcompanion', '-tAc',
       "select rolname from pg_roles where rolname in ('ic_migrate','ic_seed','ic_app') order by 1"],
      { encoding: 'utf8' },
    )
    // **This line observes the cluster, not the run.** Every way of getting a
    // postgres up -- `dev-node.sh`, `db:up`, `worktree_setup.sh` -- has already
    // run `--roles`, so the names are there before this case starts: measured,
    // replacing the mode's whole SQL input with a comment leaves it green. What
    // this case actually holds is the exit status above, which catches a moved
    // file, a wrong `-U` and a renamed service. That both halves of the SQL are
    // named is held statically, in `tests/docker/test_container_config.py`.
    expect(found.stdout.trim().split('\n')).toEqual(['ic_app', 'ic_migrate', 'ic_seed'])
  }, 60_000)
})
