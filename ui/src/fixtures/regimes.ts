/**
 * `GET /api/regimes`, captured from a running app - all three switched on,
 * which is the install default.
 */

import type { Regimes } from '@/api/regimes'

import raw from './regimes.json'

export const regimesFixture: Regimes = raw

/** The default with named regimes switched off - what a settings change looks like. */
export function withRegimes(off: readonly string[]): Regimes {
  return {
    enabled: regimesFixture.enabled,
    regimes: Object.fromEntries(
      Object.entries(regimesFixture.regimes).map(([name, regime]) => [
        name,
        off.includes(name) ? { ...regime, enabled: false, preference: false } : regime,
      ]),
    ),
  }
}
