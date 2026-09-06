/**
 * The start says when it is serving, and says it after it is.
 *
 * **Nest's own "successfully started" is logged at the end of `init`**, which
 * runs the bootstrap hooks and finishes *before* the socket binds. Where an
 * app does real work in those hooks, the last line of an ordinary start
 * belongs to a hook, and a boot that never bound reads exactly like one that
 * did.
 *
 * **Structural, because `main.ts` has no seam.** `bootstrap()` is not exported
 * and the module calls it on import; a test that ran it would bind a port.
 * What can be held is the ordering, which is the whole claim: a readiness line
 * printed before `listen` would be a lie, and the mistake this guards against
 * is somebody moving it up while tidying.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MAIN = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8')

describe('the boot', () => {
  it('announces the address it is serving on', () => {
    // http, not https: this process binds plaintext on the compose network
    // and the https address belongs to the nginx proxy in front of it.
    expect(MAIN).toMatch(/Serving on http:\/\//)
  })

  it('mints the setup token before anything can reach /api/setup', () => {
    /**
     * **Outside a lifecycle hook, the mint has no cover but this.** As
     * `SetupController.onApplicationBootstrap` it rode on `app.init()`, which
     * the harness runs too; as one explicit line in `main.ts`, deleting that
     * line leaves the whole suite green. A lost mint means `token`
     * stays null, `matchesToken` refuses every candidate, and a fresh install
     * can never be claimed -- it fails closed, silently, on first run only.
     *
     * Before `listen`, or there is a window where `/api/setup` is reachable
     * with no token to match.
     */
    const minted = MAIN.indexOf('mintIfUnclaimed(')
    const listened = MAIN.indexOf('app.listen(')
    expect(minted, 'main.ts never mints the setup token, so a fresh install cannot be claimed')
      .toBeGreaterThan(-1)
    expect(listened, 'main.ts no longer calls app.listen').toBeGreaterThan(-1)
    expect(
      minted,
      'the token is minted after the socket opens, so /api/setup is reachable before it exists',
    ).toBeLessThan(listened)
  })

  it('announces it only after the socket is listening', () => {
    const listened = MAIN.indexOf('app.listen(')
    const announced = MAIN.indexOf('`Serving on http://')
    expect(listened, 'main.ts no longer calls app.listen').toBeGreaterThan(-1)
    expect(announced, 'main.ts no longer announces the address').toBeGreaterThan(-1)
    expect(
      announced,
      'the address is announced before `listen` returns, so it says nothing ' +
        'about whether the server is reachable',
    ).toBeGreaterThan(listened)
  })
})
