#!/usr/bin/env node
/**
 * Where *this* worktree's dev stack lives: four ports, a compose project and a
 * test database, derived once and read by everyone.
 *
 *   node server/scripts/stack.mjs --json       what this worktree gets
 *   node server/scripts/stack.mjs --export     the same, as shell exports
 *   node server/scripts/stack.mjs --compose ...  docker compose, this project
 *   node server/scripts/stack.mjs --roles      apply docker/db/roles.sql
 *
 * Slots are allocated once per worktree and remembered in a registry under the
 * git common directory, so a recorded address stays right.
 */
import { execFileSync } from 'node:child_process'

import { lock } from 'proper-lockfile'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))

/**
 * The five families, and why they never meet.
 *
 * A stack is `base + slot * STRIDE`. The bases are non-congruent modulo the
 * stride (32, 79, 24, 73, 06), so no slot of one family can ever land on any
 * slot of another - which is the property that makes 40 stacks safe to hand
 * out without checking them against each other. `stack.test.ts` asserts it
 * over every slot rather than over the ones somebody tried.
 */
const STRIDE = 100
const BASE = {
  pgPort: 55432,
  redisPort: 56379,
  apiPort: 8124,
  vitePort: 5173,
  storybookPort: 6006,
}

/** Beyond this the ports leave the range these bases keep clear. */
const MAX_SLOT = 40

const root = process.env['IC_STACK_ROOT'] ?? gitRoot()

/**
 * **`.git` is a directory in the main checkout and a file in a worktree.** A
 * real git property rather than a path convention, so a worktree somebody put
 * outside `.claude/worktrees/` is still recognised - and it is trivial to
 * stand up in a test, which a path convention is not.
 */
function isMainCheckout(at) {
  try {
    return statSync(join(at, '.git')).isDirectory()
  } catch {
    return false
  }
}

/**
 * The tree this *script* lives in, never the one the caller happens to stand
 * in: `git rev-parse` runs with `cwd: scriptDir`, so an inherited working
 * directory cannot select another worktree's stack.
 */
function gitRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    cwd: scriptDir,
  }).trim()
}

function registryPath() {
  const named = process.env['IC_STACK_REGISTRY']
  if (named) return named
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    encoding: 'utf8',
    cwd: root,
  }).trim()
  return join(common, 'incidentcompanion-stack-slots.json')
}

function read(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

/** Integer, in range, and therefore safe to multiply into a port. */
function isSlot(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_SLOT
}

/**
 * Hold the registry exclusively for the read-modify-write, running `work()`
 * inside the lock and releasing it however `work()` ends.
 *
 * Creates the registry file if it is missing, because the lock names a path
 * that must exist. A lock compromised while held throws rather than letting
 * `work()` finish.
 */
async function withRegistryLock(path, work) {
  mkdirSync(dirname(path), { recursive: true })
  // The lock names a path that must exist; an empty registry is the ordinary
  // first case, so it is created rather than treated as an error.
  if (!existsSync(path)) writeFileSync(path, '{}')
  // **`stale` must stay under the retry ladder's total, or an abandoned lock
  // fails instead of healing.** The ladder is 18,275ms --
  //
  //     node -e "console.log(require('retry').timeouts(
  //       {retries:40,minTimeout:25,maxTimeout:500}).reduce((a,b)=>a+b,0))"
  //
  // -- so a `stale` of 20s left a 1.7s window in which a caller gave up
  // *before* proper-lockfile would have broken the dead holder's lock, and the
  // error below then blamed the leftover `.lock` it was about to inherit.
  // Measured: kill -9 the holder and run immediately, 18,520ms and a refusal;
  // re-run at once, 220ms and success. Raising the ladder instead does not
  // reach it -- 42 retries is 19,275ms, still short.
  //
  // The section is a read, a JSON parse and a rename, so 15s is already orders
  // of magnitude past any honest holder.
  const release = await lock(path, {
    retries: { retries: 40, minTimeout: 25, maxTimeout: 500 },
    stale: 15_000,
    onCompromised: (error) => {
      throw new Error(`The stack-slot lock was compromised: ${error.message}`)
    },
  }).catch((error) => {
    if (error?.code !== 'ELOCKED') throw error
    // No duration in the message: the ladder's real total is 18.3s rather than
    // the "ten seconds" the comment used to claim, and a reader cannot act on
    // either number. `cause` keeps the path and stack proper-lockfile attached.
    throw new Error(
      `Another run holds the stack registry (${path}): a second suite, a ` +
        `second worktree's stack, or a killed run that left ${path}.lock behind.`,
      { cause: error },
    )
  })

  try {
    return work()
  } finally {
    release()
  }
}

/**
 * The slot for this worktree, allocated on first ask and remembered after.
 *
 * **Keyed on the absolute path, not the directory name.** Two worktrees of one
 * clone can both be called `api`, and a basename key hands them one slot, one
 * compose project and one set of ports - deterministically, so it survives
 * every retry.
 */
async function slotFor(key, path) {
  return withRegistryLock(path, () => {
    const slots = read(path)
    // A remembered slot is validated too: the registry is a file on disk, and
    // a hand-edited or truncated one otherwise multiplies straight into a port
    // (9999 gave 1055332, -5 gave 54932).
    if (isSlot(slots[key])) return slots[key]

    const lowestFree = (entries) => {
      const taken = new Set(Object.values(entries).filter(isSlot))
      let slot = 1
      while (taken.has(slot)) slot += 1
      return slot
    }

    let live = slots
    let slot = lowestFree(live)

    /**
     * **A slot whose worktree is gone is free, and that is asked only once the
     * registry is full.** `git worktree remove` knows nothing about this file,
     * so without reclaiming, every tree ever created holds its slot for ever
     * and the 41st is refused - a laptop that has churned through forty
     * throwaway worktrees cannot start a stack at all, and the message blames
     * the registry rather than the removals.
     *
     * **Asked last rather than first, because `existsSync` answers about this
     * process's filesystem view.** Agent stacks run as sibling containers
     * against one repository; if any of them sees a worktree at a path this
     * one cannot, an eager sweep reads a live entry as gone and hands its slot
     * out twice - two stacks on identical ports, which is the failure this
     * whole file exists to prevent.
     *
     * **Asking last narrows that window rather than closing it.** A registry
     * that is genuinely full still prunes on this process's view, so the
     * collision remains reachable; what changes is that it needs forty live
     * worktrees first, where an eager sweep reached it with two.
     */
    if (slot > MAX_SLOT) {
      live = Object.fromEntries(Object.entries(slots).filter(([at]) => existsSync(at)))
      slot = lowestFree(live)
    }

    if (slot > MAX_SLOT) {
      throw new Error(
        `No stack slot left: ${MAX_SLOT} worktrees are registered in ${path}, ` +
          'and every one of them is still on disk.',
      )
    }

    const temp = `${path}.${process.pid}`
    writeFileSync(temp, JSON.stringify({ ...live, [key]: slot }, null, 2))
    renameSync(temp, path)
    return slot
  })
}

/**
 * A directory name is not a database name.
 *
 * `my.tree` and `my-tree` both reach Postgres as something a plain URL cannot
 * name, and a quoted identifier that differs from the one in the connection
 * string fails as "database does not exist" - which reads as a provisioning
 * fault rather than as naming. So the slug is reduced to what a database will
 * take, and the port keeps the stacks apart when two names reduce alike.
 */
function dbSlug(name) {
  const reduced = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return reduced === '' ? 'worktree' : reduced
}

const slug = basename(root)
const main = isMainCheckout(root)
const slot = main ? 0 : await slotFor(root, registryPath())

const ports = Object.fromEntries(
  Object.entries(BASE).map(([name, base]) => [name, base + slot * STRIDE]),
)

/**
 * **The database name does not carry the worktree, and that is deliberate.**
 * Each stack has its own Postgres, so the port already separates them and a
 * second name buys nothing - while costing the one thing that has to work
 * first: the admin connection provisions the test database, so it must name a
 * database the container has already created. `POSTGRES_DB` is
 * `incidentcompanion` in every stack, so anything else is a connection failure
 * that reads as a provisioning fault.
 */
const database = 'incidentcompanion'
const host = `127.0.0.1:${ports.pgPort}`

const stack = {
  slug,
  slot,
  main,
  /**
   * **The slot is in the name, not only the ports.** Compose identifies a
   * container by project plus service, so two worktrees both called `api` -
   * distinct ports, identical project - had the second's `up` recreate the
   * first's containers on its own ports and one `down` remove both, while each
   * believed it held its own stack. They shared the data volume too.
   */
  project: main
    ? 'incidentcompanion-node-dev'
    : `incidentcompanion-node-dev-${dbSlug(slug)}-${String(slot)}`,
  ...ports,
  database,
  databaseUrl: `postgres://ic_app:ic_app@${host}/${database}`,
  seedDatabaseUrl: `postgres://ic_seed:ic_seed@${host}/${database}`,
  migrateDatabaseUrl: `postgres://ic_migrate:ic_migrate@${host}/${database}`,
  adminDatabaseUrl: `postgres://incidentcompanion:incidentcompanion@${host}/${database}`,
  // `global-setup.ts` refuses anything not ending in `_test`, which is the only
  // thing between a suite that truncates and the database an app is open on.
  testDatabaseUrl: `postgres://incidentcompanion:incidentcompanion@${host}/${database}_test`,
  redisUrl: `redis://127.0.0.1:${ports.redisPort}`,
  // **http, since the server stopped terminating TLS.** Every consumer -- the
  // dev launcher, vitest, the browser tier -- reads the scheme from here, so
  // this line is the whole change for all of them.
  apiUrl: `http://127.0.0.1:${ports.apiPort}`,
}

const SHELL = {
  IC_STACK_SLUG: 'slug',
  IC_STACK_SLOT: 'slot',
  IC_COMPOSE_PROJECT: 'project',
  IC_PG_PORT: 'pgPort',
  IC_REDIS_PORT: 'redisPort',
  IC_API_PORT: 'apiPort',
  IC_VITE_PORT: 'vitePort',
  IC_STORYBOOK_PORT: 'storybookPort',
  IC_DATABASE: 'database',
  DATABASE_URL: 'databaseUrl',
  SEED_DATABASE_URL: 'seedDatabaseUrl',
  IC_MIGRATE_DATABASE_URL: 'migrateDatabaseUrl',
  ADMIN_DATABASE_URL: 'adminDatabaseUrl',
  TEST_DATABASE_URL: 'testDatabaseUrl',
  REDIS_URL: 'redisUrl',
}


/**
 * `docker compose` against *this* worktree's project, with `compose.dev.yaml`
 * and the derived project name already supplied.
 *
 * Every compose call goes through here, including `--roles`: a bare
 * `docker compose` from a worktree addresses the main checkout's containers.
 */
function compose(args, opts) {
  const argv = ['compose', '-p', stack.project, '-f', join(dirname(scriptDir), 'compose.dev.yaml'), ...args]
  const env = { ...process.env, IC_PG_PORT: String(stack.pgPort), IC_REDIS_PORT: String(stack.redisPort) }
  return execFileSync('docker', argv, { ...opts, env })
}

if (process.argv.includes('--export')) {
  for (const [name, key] of Object.entries(SHELL)) {
    console.log(`export ${name}='${String(stack[key])}'`)
  }
} else if (process.argv[2] === '--compose') {
  compose(process.argv.slice(3), { stdio: 'inherit' })
} else if (process.argv[2] === '--roles') {
  /**
   * Apply `docker/db/roles.sql` to this worktree's cluster, piped to psql's
   * stdin so the file is resolved by this process rather than by the daemon.
   *
   * Idempotent, like the file itself. `db:up` and `dev-node.sh` both call it;
   * without it the cluster holds only the superuser and the first query fails
   * with `role "ic_migrate" does not exist`.
   */
  compose([
    'exec', '-T', 'postgres', 'psql',
    '-v', 'ON_ERROR_STOP=1',
    /**
     * **The same variables the shipped stack passes**, because `roles.sql`
     * takes its passwords from them rather than spelling any.
     *
     * The values are the role names, and here that is a *fixture* rather than
     * a credential: this cluster is a per-worktree tmpfs on a random loopback
     * port, thrown away with the worktree, holding nothing but generated test
     * data. The shipped stack mints real ones into `.env`
     * (`docker/secrets.sh`), and `test_container_config.py` refuses a literal
     * in `roles.sql` or a default in `compose.yaml`.
     *
     * They match `databaseUrl` and its two siblings above; change one and the
     * suite fails to authenticate rather than failing to start.
     */
    '-v', 'ic_migrate_password=ic_migrate',
    '-v', 'ic_seed_password=ic_seed',
    '-v', 'ic_app_password=ic_app',
    '-q', '-U', 'incidentcompanion', '-d', stack.database,
  ], {
    // **Two levels up, not one.** `roles.sql` moved to `docker/db/` with the
    // rest of the image files on 2026-08-16, so this walks past `server/` to
    // the repository root. A computed path is invisible to a grep for the old
    // one -- this was found by the suite failing with `ENOENT: db/roles.sql`,
    // not by the sweep.
    // Both halves, because psql is the executor that can run both. The test
    // harness takes `roles.sql` alone -- see its own header.
    input: ['roles.sql', 'role-passwords.sql']
      .map((name) => readFileSync(join(dirname(dirname(scriptDir)), 'docker', 'db', name)))
      .join('\n'),
    stdio: ['pipe', 'ignore', 'inherit'],
  })
} else {
  console.log(JSON.stringify(stack, null, 2))
}
