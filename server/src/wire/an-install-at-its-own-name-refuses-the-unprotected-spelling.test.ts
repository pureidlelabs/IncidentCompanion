/**
 * **Where an install is reached at a name of its own it tells the browser to
 * refuse the unprotected spelling of that name, and at a loopback address it
 * does not.**
 *
 * The requirement is conditional rather than a yes or no, and the code met
 * half of it: HSTS was off unconditionally and both comments explaining that
 * argued only the loopback case. An install at `incidents.example` therefore
 * sent nothing, so an analyst who typed the host without a scheme made one
 * unprotected request to a host serving live investigations. -> #138
 *
 * **`includeSubDomains` is forbidden in as many words** -- *the instruction
 * MUST NOT be extended to names below the one the install is reached at* --
 * and it is the reflex when adding this. `preload` likewise: that is a
 * submission to a browser list the install cannot withdraw from.
 *
 * **What this does not cover:** the edge. nginx answers with its own copy of
 * this decision, keyed on the host it was actually reached at, and
 * `tests/docker/test_container_config.py` is what holds that one.
 */
import { describe, expect, it } from 'vitest'

import { tellsTheBrowserToRefuseHttp } from './headers.js'

describe('an install reached at a name of its own', () => {
  it.each([
    ['https://incidents.example'],
    ['https://incidents.example:8443'],
    ['https://ic.corp.internal'],
  ])('is told to refuse the unprotected spelling of %s', (baseURL) => {
    expect(tellsTheBrowserToRefuseHttp(baseURL)).toBe(true)
  })

  /**
   * **A loopback address is every application on that machine**, so the
   * instruction would reach far beyond the install giving it and cannot be
   * withdrawn by the install that gave it.
   */
  it.each([
    ['https://localhost'],
    ['https://127.0.0.1:443'],
    ['https://[::1]:8443'],
    ['http://localhost:3000'],
  ])('is not said at %s', (baseURL) => {
    expect(tellsTheBrowserToRefuseHttp(baseURL)).toBe(false)
  })

  /**
   * **An unprotected base URL is not an install to protect.** Saying it over
   * http is the one delivery a browser is required to ignore, and an install
   * configured that way has a different problem.
   */
  it('is not said where the install is not reached over https at all', () => {
    expect(tellsTheBrowserToRefuseHttp('http://incidents.example')).toBe(false)
  })

  it('is not said for a base URL nobody can parse', () => {
    expect(tellsTheBrowserToRefuseHttp('not a url')).toBe(false)
  })
})
