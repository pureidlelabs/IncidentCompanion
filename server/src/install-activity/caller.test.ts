/** What `@Caller()` hands a handler. */
import { describe, expect, it } from 'vitest'

import { callerOf } from './caller.js'

const session = { user: { id: 'u1', name: 'An Analyst', email: 'a@example.test' } }
const headers = { 'user-agent': 'probe', 'x-forwarded-for': '198.51.100.7' }
const request = { session, headers, url: '/api/customers' }

const context = { switchToHttp: () => ({ getRequest: () => request }) } as never

describe('the caller a handler is given', () => {
  it('is the session the request was authenticated with', () => {
    expect(callerOf(context).session).toBe(session)
  })

  it('carries the headers, which is what the audit reads the address from', () => {
    expect(callerOf(context).headers).toBe(headers)
  })

  it('carries the request, so a named act can mark it accounted for', () => {
    expect(callerOf(context).request).toBe(request)
  })
})
