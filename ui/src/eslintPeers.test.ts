/**
 * That the `legacy-peer-deps` flag in `.npmrc` is still needed.
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require_ = createRequire(import.meta.url)

function packageJson(name: string): { version?: string; peerDependencies?: Record<string, string> } {
  return require_(`${name}/package.json`) as ReturnType<typeof packageJson>
}

describe('the forced peer resolution', () => {
  it('is still forced by eslint-plugin-jsx-a11y, or the flag can go', () => {
    const plugin = packageJson('eslint-plugin-jsx-a11y')
    const eslint = packageJson('eslint')
    const range = plugin.peerDependencies?.eslint ?? ''
    const major = Number((eslint.version ?? '0').split('.')[0])

    // The guard: a range that stops naming majors, or an eslint that stops
    // reporting one, would make the assertion below vacuously true.
    expect(range, 'eslint-plugin-jsx-a11y declares no eslint peer').not.toBe('')
    expect(major, 'could not read the installed eslint major').toBeGreaterThan(0)

    const allows = range.includes(`^${String(major)}`) || range.includes(`>=${String(major)}`)
    expect(
      allows,
      `eslint-plugin-jsx-a11y ${plugin.version ?? '?'} now allows eslint ` +
        `${String(major)} (peer range: ${range}). Delete ui/.npmrc and this ` +
        'test, and reinstall without --legacy-peer-deps.',
    ).toBe(false)
  })
})
