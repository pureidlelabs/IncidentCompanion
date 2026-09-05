/**
 * The boundary, attacked: does it record what nobody asked it to?
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Observable, of, throwError } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'

import { AuditInterceptor, NAMED, type AuditedRequest } from './audit.interceptor.js'
import type { InstallActivityService } from './install-activity.service.js'

interface Line {
  event: string
  outcome?: string | undefined
  target?: string | null | undefined
  detail?: Record<string, string> | undefined
}

function harness() {
  const lines: Line[] = []
  const activity = {
    record: (one: Line) => {
      lines.push(one)
      return Promise.resolve()
    },
  } as unknown as InstallActivityService
  return { lines, interceptor: new AuditInterceptor(activity) }
}

function requestFor(method: string, path: string, named = false): AuditedRequest {
  const request = {
    method,
    path,
    route: { path },
    headers: { 'x-real-ip': '203.0.113.7' },
    session: { user: { id: 'analyst-1', name: 'Dev Analyst' } },
  } as unknown as AuditedRequest
  if (named) request[NAMED] = true
  return request
}

const contextFor = (request: AuditedRequest) =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  }) as never

/** Runs the interceptor and settles the observable. */
async function run(
  interceptor: AuditInterceptor,
  request: AuditedRequest,
  // **`Observable<unknown>`, not `ReturnType<typeof of>`.** With no type
  // argument that alias is `Observable<never>`, which nothing a handler
  // actually returns is assignable to -- so every call site was a type error
  // while the suite ran green.
  handler: { handle: () => Observable<unknown> },
) {
  await new Promise<void>((done) => {
    interceptor.intercept(contextFor(request), handler as never).subscribe({
      next: () => undefined,
      error: () => {
        done()
      },
      complete: () => {
        done()
      },
    })
  })
  // The writes are fire-and-forget, so let the microtask queue drain.
  await Promise.resolve()
  await Promise.resolve()
}

describe('the audit boundary', () => {
  const ok = { handle: () => of({}) }

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'records a %s that no route asked it to record',
    async (method) => {
      const { lines, interceptor } = harness()

      await run(interceptor, requestFor(method, '/api/anything'), ok)

      expect(lines).toHaveLength(1)
      expect(lines[0]?.event).toBe('api_called')
      expect(lines[0]?.outcome).toBe('success')
      expect(lines[0]?.target).toBe(`${method} /api/anything`)
    },
  )

  /**
   * **A line per `GET` would be a line per pane load per row.**
   */
  it('stays quiet on an ordinary read', async () => {
    const { lines, interceptor } = harness()

    await run(interceptor, requestFor('GET', '/api/cases'), ok)

    expect(lines).toEqual([])
  })

  it.each([
    ['/api/cases/{caseId}/evidence/{id}/file', 'evidence_read'],
    ['/api/cases/{caseId}/exports/timeline.csv', 'data_exported'],
  ])('records %s as a named sensitive read', async (path, event) => {
    const { lines, interceptor } = harness()

    await run(interceptor, requestFor('GET', path), ok)

    expect(lines).toHaveLength(1)
    expect(lines[0]?.event).toBe(event)
  })

  /**
   * **One act is one line.**
   */
  it('defers to a route that named what it did', async () => {
    const { lines, interceptor } = harness()

    await run(interceptor, requestFor('POST', '/api/accounts', true), ok)

    expect(lines).toEqual([])
  })

  /**
   * **A write that failed is a write that was attempted**, which is the half
   * an audit is read for - and it must not read as a success.
   */
  it('records a failed write as a failure, with the status', async () => {
    const { lines, interceptor } = harness()
    const boom = { handle: () => throwError(() => new Error('nope')) }

    await run(interceptor, requestFor('POST', '/api/cases'), boom)

    expect(lines).toHaveLength(1)
    expect(lines[0]?.event).toBe('api_called')
    expect(lines[0]?.outcome).toBe('failure')
  })

  it.each([
    ['403', () => new ForbiddenException()],
    ['401', () => new UnauthorizedException()],
  ])('records a %s refusal, even on a read', async (status, make) => {
    const { lines, interceptor } = harness()
    const refused = { handle: () => throwError(make) }

    await run(interceptor, requestFor('GET', '/api/accounts'), refused)

    expect(lines).toHaveLength(1)
    expect(lines[0]?.event).toBe('access_denied')
    expect(lines[0]?.outcome).toBe('failure')
    expect(lines[0]?.detail?.['status']).toBe(status)
  })

  /**
   * **Never the URL the caller typed.**
   */
  it('records the matched route, not the path the caller sent', async () => {
    const { lines, interceptor } = harness()
    const request = requestFor('DELETE', '/api/cases/{caseId}')
    ;(request as unknown as { path: string }).path = '/api/cases/<script>alert(1)</script>'

    await run(interceptor, request, ok)

    expect(lines[0]?.target).toBe('DELETE /api/cases/{caseId}')
  })

  /**
   * **The worst failure this design can have: an act with no line at all.**
   */
  it('still records at the boundary when a named write failed', async () => {
    const { lines, interceptor } = harness()
    // The route named the act, but its own write did not land - so nothing
    // marked the request.
    const request = requestFor('POST', '/api/accounts/{username}/role')

    await run(interceptor, request, ok)

    expect(lines, 'a failed named write must not silence the boundary').toHaveLength(1)
    expect(lines[0]?.event).toBe('api_called')
  })

  it('does not touch a socket', async () => {
    const { lines, interceptor } = harness()
    const socket = { getType: () => 'ws' } as never
    const handler = { handle: vi.fn(() => of({})) }

    interceptor.intercept(socket, handler as never)

    expect(handler.handle).toHaveBeenCalledOnce()
    expect(lines).toEqual([])
  })

  /**
   * **A line MUST NOT carry what was sent**, and the requirement names who that
   * protects: the audit *is read by people who do not reach the case data the
   * install holds*.
   */
  it('writes no part of a request body, whatever the body carried', async () => {
    const { lines, interceptor } = harness()
    const secret = 'correct-horse-battery-staple'
    const request = requestFor('POST', '/api/accounts')
    Object.assign(request, {
      body: { password: secret, passphrase: secret, nested: { current: secret } },
    })

    await run(interceptor, request, ok)

    expect(lines).toHaveLength(1)
    expect(JSON.stringify(lines[0]), 'the audit carries what the caller sent').not.toContain(secret)
  })

  /**
   * **Where the address is filtered, and why it is not asserted here.** This
   * boundary hands `record` the request's headers verbatim; `record.ts` is
   * what takes `x-real-ip` and refuses `x-forwarded-for`, and
   * `record.test.ts` asserts exactly that against a stored row.
   */
  it('hands the headers on rather than deciding the address itself', async () => {
    const { lines, interceptor } = harness()
    const request = requestFor('POST', '/api/accounts')
    Object.assign(request, {
      headers: { 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' },
    })

    await run(interceptor, request, ok)

    expect(lines).toHaveLength(1)
    expect(lines[0], 'the boundary invented an address of its own').not.toHaveProperty('ipAddress')
  })
})
