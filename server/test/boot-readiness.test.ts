/**
 * The start says when it is serving, and says it after it is.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MAIN = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8')

describe('the boot', () => {
  it('announces the address it is serving on', () => {
    // http since nginx took over TLS: this process binds plaintext on the
    // compose network and the https address belongs to the proxy in front.
    expect(MAIN).toMatch(/Serving on http:\/\//)
  })

  it('mints the setup token before anything can reach /api/setup', () => {
    /**
     * **Outside a lifecycle hook, the mint has no cover but this.**
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
