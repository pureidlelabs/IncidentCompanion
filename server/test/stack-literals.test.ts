/**
 * No tier may write a stack port down.
 *
 * **A consumer left on a literal is green.** `stack.test.ts` asserts the
 * *derivation*, and nothing else holds any single consumer to it: reverting
 * `playwright.config.ts` to a hardcoded port left the whole suite and both
 * typechecks passing. So a config, a shell gate, a fallback and an allowlist
 * can each drift out of the derivation on their own, one at a time.
 *
 * **So the property is about the source, not the arithmetic**, which is why it
 * is a sweep rather than another unit test. `tests/repo/test_source_hygiene.py` is
 * the same shape one tier over.
 *
 * A file that legitimately names a port is listed here with its reason. The
 * list is the decision; growing it silently is the failure.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/** The slot-0 numbers. A literal is only ever one of these four. */
const PORTS = [55432, 56379, 8124, 5173]

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
  cwd: new URL('.', import.meta.url).pathname,
}).trim()

/**
 * Where a port may still be written down, and why.
 *
 * - the script that derives them
 * - `compose.dev.yaml`, whose `${IC_PG_PORT:-55432}` defaults are what keep a
 *   bare `docker compose up` landing where every note says it does
 * - prose: the knowledge notes and this file
 *
 * **An entry that allows nothing comes off.** The two stack suites were listed
 * here under a path they had never had, so nothing could tell whether they
 * were exempt or simply unmatched; neither writes a literal today, and a line
 * leaves this list the moment it stops allowing something.
 */
const ALLOWED = new Set([
  'server/scripts/stack.mjs',
  'server/compose.dev.yaml',

  // Display data rather than a target: a fixture Location for a URL-building
  // unit test, which connects to nothing.
  'ui/src/api/presence.test.ts',

  // Auth tests asserting a base URL as a literal string. `trusted-origins.ts`
  // itself derives its port, so it is not listed.
  'server/src/auth/trusted-origins.test.ts',
  'server/src/auth/auth.config.test.ts',
  'server/src/auth/auth.schema.test.ts',

  // Hand-run maintenance tools, each with an environment override in front of
  // the literal. They operate on the wrong stack from a worktree, which is
  // wrong and is not silent - they print the URL they connect to.
  'server/scripts/backup.sh',
  'server/scripts/prune.sh',
  'server/scripts/prose-two-instances.ts',
  '.claude/scripts/injection_probe.py',
  '.claude/scripts/patch_probe.py',
])

const SEARCHED = [
  // `.claude/scripts` holds two probes that drive the *Node* API and named
  // 8124: the same class as the maintenance scripts in ALLOWED, and outside
  // the roots this list originally had.
  '.claude/scripts',
  'server/src',
  'server/e2e',
  'server/scripts',
  'server/vitest.config.mts',
  'server/package.json',
  'server/compose.dev.yaml',
  'ui/src',
  'ui/vite.config.ts',
  'dev-node.sh',
  'verify.sh',
  'test.sh',
]

/**
 * The file with its comments removed.
 *
 * **A port in a comment is documentation; a port in code is a second
 * derivation.** This sweep is about the second, and every note and docstring
 * in the tree quotes the slot-0 numbers deliberately - they are the measured
 * defaults.
 *
 * **Stripping can only ever hide a hit, so it is kept as narrow as it can be.**
 * Removing *trailing* `//` comments needs a "not preceded by a colon" guard to
 * spare `https://`, and that guard rescues one shape while hiding four - a
 * template literal splitting the scheme, a protocol-relative URL, a
 * concatenated scheme, and a private class field.
 */
function code(text: string, shellish: boolean): string {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // **Whole-line `//` only.** Stripping a *trailing* `//` needed a "not
    // preceded by a colon" guard to spare `https://`, and that guard rescued
    // exactly one shape while hiding four realistic ones - a template literal
    // splitting the scheme, a protocol-relative URL, a concatenated scheme,
    // and a private class field at the start of a line. A trailing comment
    // holding a bare port number costs one entry in ALLOWED; a hidden hit is
    // the defect this file exists to catch, so the failure direction is
    // chosen rather than inherited.
    .replace(/^\s*\/\/.*$/gm, '')
  // `#` starts a comment in shell and YAML and a private field in TypeScript.
  return shellish ? stripped.replace(/^\s*#.*$/gm, '') : stripped
}

/** Every tracked file under the searched roots, repo-relative. */
function tracked(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...SEARCHED], {
    encoding: 'utf8',
    cwd: REPO,
    maxBuffer: 32 * 1024 * 1024,
  })
  return out.split('\0').filter(Boolean)
}

describe('the stack ports are derived, never written down', () => {
  it('finds files to search, so a broken path list cannot pass by matching nothing', () => {
    // The vacuity guard. A sweep over zero files satisfies every assertion
    // below it and reports the codebase clean.
    expect(tracked().length).toBeGreaterThan(200)
  })

  /**
   * **The stripper's own blind spots, asserted rather than reasoned about.**
   * Every shape here is one a real config could take, and four of them are
   * invisible to a stripper that takes trailing comments. A regression in
   * `code()` is otherwise silent: the sweep keeps passing and covers less.
   */
  it.each([
    ["const B = 'https://127.0.0.1:8124'", 'a plain URL'],
    ['const B = `${proto}//127.0.0.1:8124`', 'a template literal splitting the scheme'],
    ["const B = '//127.0.0.1:8124'", 'a protocol-relative URL'],
    ["const B = proto + '//127.0.0.1:8124'", 'a concatenated scheme'],
    ['#apiPort = 8124', 'a private class field at the start of a line'],
    ['const p = 8124 // the default', 'a trailing comment beside real code'],
  ])('still sees %s (%s)', (line) => {
    expect(code(line, false)).toContain('8124')
  })

  it('drops a whole-line comment, which is the only thing it may drop', () => {
    expect(code('  // talks to 8124\nconst x = 1', false)).not.toContain('8124')
    expect(code('/* 8124 */ const x = 1', false)).not.toContain('8124')
    // Shell only: `#` is a private field in TypeScript.
    expect(code('# talks to 8124', true)).not.toContain('8124')
    expect(code('#apiPort = 8124', false)).toContain('8124')
  })

  /**
   * **Uuids are blanked before the search, because a dash is not a digit.**
   * The boundaries above stop `8124` matching inside `18124`; they do not stop
   * it matching inside `4f0186df-8124-4364-beb5-cd9b06b8b2fa`, which is what a
   * captured fixture is full of. Recapturing a demo turns this red naming a
   * file that mentions no port at all, and the next capture moves it to a
   * different file -- which reads as flake rather than as a rule.
   *
   * Blanking rather than skipping the file: a fixture that really did hardcode
   * a port is still caught.
   */
  const withoutUuids = (text: string): string =>
    text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')

  /**
   * **Every port against each file, reading the tree once.**
   *
   * As four cases this read every tracked file four times, and under the load
   * of a full run that took 6386ms against vitest's 5000ms default -- reported
   * as a *failed assertion on port 55432*, which is a sweep claiming to have
   * found a literal it never got far enough to look for. Alone, warm, the file
   * took 1.7s and passed, so it read as a flake for three runs.
   *
   * The budget is still here because the walk grows with the repository, and a
   * timeout in this case says nothing about what it swept.
   */
  const offendersByPort = (): Map<number, string[]> => {
    const found = new Map<number, string[]>(PORTS.map((port) => [port, []]))
    // Bounded by non-digits, so 55432 does not match inside 155432 and a year
    // or a byte count with the same digits is not a hit either.
    const patterns = PORTS.map((port) => [port, new RegExp(`(?<![0-9])${port}(?![0-9])`)] as const)

    for (const path of tracked()) {
      if (ALLOWED.has(path)) continue
      let text: string
      try {
        text = readFileSync(join(REPO, path), 'utf8')
      } catch {
        continue // A deleted-but-tracked path; git ls-files can outrun the tree.
      }
      const searchable = withoutUuids(code(text, /\.(sh|ya?ml)$/.test(path)))
      for (const [port, pattern] of patterns) {
        if (pattern.test(searchable)) found.get(port)!.push(path)
      }
    }
    return found
  }

  let swept: Map<number, string[]>
  // 60s against a warm 1.7s: the walk grows with the repository, and this runs
  // beside the rest of the suite rather than alone.
  beforeAll(() => {
    swept = offendersByPort()
  }, 60_000)

  it.each(PORTS)('has no literal %i outside the files allowed to name it', (port) => {
    expect(
      swept.get(port),
      `derive it: node server/scripts/stack.mjs --json, or add the file to ALLOWED with a reason`,
    ).toEqual([])
  })
})
