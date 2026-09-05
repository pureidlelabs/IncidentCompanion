/**
 * **Every check on the handshake can be observed failing** -- the last sentence
 * of `openspec/specs/live/spec.md`'s first requirement, and the scenario under
 * it:
 */
import type { IncomingMessage } from 'node:http'

import { describe, expect, it } from 'vitest'

import { LiveGateway, STATUS, type Refusal } from './live.gateway.js'
import type { CaseChannel } from './case-channel.service.js'

const CASE = '11111111-1111-4111-8111-111111111111'
const GHOST = '00000000-0000-4000-8000-000000000000'

const HERE = { origin: 'http://localhost:5174', host: 'localhost:5174' }

const request = (url: string, headers: Record<string, string> = HERE) =>
  ({ url, headers }) as unknown as IncomingMessage

/** Reach that admits everybody, so a case only fails on existence. */
const anyoneReaches = {
  defaultCustomerId: () => Promise.resolve('a-default-customer'),
  levelFor: () => Promise.resolve('write' as const),
} as never

/** Reach that admits nobody, so a case that exists is still out of reach. */
const nobodyReaches = {
  defaultCustomerId: () => Promise.resolve('a-default-customer'),
  levelFor: () => Promise.resolve(null),
} as never

function gatewayWith(
  options: {
    signedIn?: boolean
    caseExists?: boolean
    held?: boolean
    reach?: unknown
  } = {},
) {
  const { signedIn = true, caseExists = true, held = false, reach = anyoneReaches } = options

  const auth = {
    api: {
      getSession: () =>
        Promise.resolve(
          signedIn
            ? { user: { id: 'u-1', name: 'Ada', email: 'a@b.test', ...(held ? { mustChangePassword: true } : {}) } }
            : null,
        ),
    },
  }
  const db = {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(caseExists ? [{ id: CASE }] : []) }),
    }),
  }
  const audit = { record: () => Promise.resolve() }

  return new LiveGateway(
    {} as CaseChannel,
    auth as never,
    db as never,
    {} as never,
    audit as never,
    reach as never,
  )
}

/**
 * One handshake per refusal the gateway can answer with.
 */
const DRIVES: Record<Refusal, () => Promise<{ refused: Refusal | null }>> = {
  'no-such-path': () => gatewayWith().check(request('/api/cases/abc/other')),
  'cross-origin': () =>
    gatewayWith().check(
      request(`/api/cases/${CASE}/live`, { origin: 'https://evil.test', host: 'localhost:5174' }),
    ),
  unauthenticated: () => gatewayWith({ signedIn: false }).check(request(`/api/cases/${CASE}/live`)),
  'must-change-password': () =>
    gatewayWith({ held: true }).check(request(`/api/cases/${CASE}/live`)),
  'no-such-case': () =>
    gatewayWith({ caseExists: false }).check(request(`/api/cases/${GHOST}/live`)),
}

describe('every check on the handshake can be observed failing', () => {
  /**
   * **The completeness guard, and the reason this file is not another list.**
   */
  it('drives every refusal the gateway declares', () => {
    expect(Object.keys(DRIVES).sort()).toEqual(Object.keys(STATUS).sort())
  })

  it.each(Object.keys(STATUS) as Refusal[])('still refuses with %s', async (reason) => {
    const verdict = await DRIVES[reason]()
    expect(
      verdict.refused,
      `nothing produces ${reason} any more, so the check behind it could be removed unnoticed`,
    ).toBe(reason)
  })

  /**
   * *A connection names a case the session does not reach* -- **and the refusal
   * does not reveal whether that case exists.**
   */
  it('answers a case out of reach exactly as it answers one that is not there', async () => {
    const outOfReach = await gatewayWith({ caseExists: true, reach: nobodyReaches }).check(
      request(`/api/cases/${CASE}/live`),
    )
    const absent = await gatewayWith({ caseExists: false }).check(request(`/api/cases/${GHOST}/live`))

    expect(outOfReach.refused, 'a case the analyst cannot reach was admitted').toBe('no-such-case')
    expect(outOfReach.refused).toBe(absent.refused)
    expect(STATUS[outOfReach.refused!]).toBe(STATUS[absent.refused!])
    expect(STATUS['no-such-case'], 'the status itself tells them apart').toContain('404')
  })

  /**
   * **A held account is refused before the case is looked up**, so it learns
   * nothing about which case ids exist.
   */
  it('refuses a held account without telling it whether the case is real', async () => {
    const verdict = await gatewayWith({ held: true, caseExists: false }).check(
      request(`/api/cases/${GHOST}/live`),
    )
    expect(verdict.refused).toBe('must-change-password')
  })
})
