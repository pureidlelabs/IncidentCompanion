/**
 * The launcher's environment, put through the schema that refuses to start.
 *
 * **Asked of the script rather than read off it.** `--export` prints what the
 * seeder and Nest are handed, so the check is `loadEnv` on the real values: a
 * variable that is missing, empty, or spelled in a way the schema rejects all
 * fail the same way here, and none of them can be answered by an assignment
 * appearing somewhere in the file.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { loadEnv } from '../src/config/env.js'

const LAUNCHER = fileURLToPath(new URL('../../dev-node.sh', import.meta.url))

/**
 * Run the launcher's `--export` and read back what it exported.
 *
 * **Nothing of this process's environment is passed on but `PATH` and `HOME`.**
 * Vitest sets `NODE_ENV=test` itself, so inheriting would hand the script the
 * one variable this is about and the launcher could set nothing at all and
 * still pass.
 */
function launcherEnvironment(): Record<string, string> {
  const printed = execFileSync('bash', [LAUNCHER, '--export'], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' },
  })

  const found: Record<string, string> = {}
  for (const line of printed.split('\n')) {
    const match = /^declare -x ([A-Za-z_][A-Za-z0-9_]*)="(.*)"$/.exec(line)
    if (match?.[1] !== undefined) found[match[1]] = match[2] ?? ''
  }
  return found
}

describe('the development stack', () => {
  it('hands the application an environment the application accepts', () => {
    const environment = launcherEnvironment()

    // The whole schema, rather than a list of names restated here: a variable
    // added to `env.ts` with no default is caught the day it is added.
    expect(() => {
      loadEnv(environment)
    }).not.toThrow()
  })

  it('exports enough for the check above not to run over an empty set', () => {
    const environment = launcherEnvironment()

    expect(Object.keys(environment).length).toBeGreaterThan(4)
    expect(environment['DATABASE_URL']).toMatch(/^postgres:\/\//)
  })
})
