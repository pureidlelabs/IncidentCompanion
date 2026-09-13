/**
 * The registered `Retry-After` field on every refusal that names a wait.
 *
 * Applies to a 429 that already carries the wait under some other name and
 * leaves one that sets `Retry-After` itself untouched.
 */
import type { RequestHandler, Response } from 'express'

/** RFC 9110 s10.2.3. What an off-the-shelf retry client looks for. */
const STANDARD = 'retry-after'

/**
 * The other names one wait is sent under.
 *
 * `@nestjs/throttler` suffixes the field with the name of every tier not
 * called `default`, and Better Auth's limiter sends `X-Retry-After`. Matched
 * by shape rather than listed, so a tier renamed or added is covered without
 * this file knowing the names.
 */
const OTHER_NAMES = /^(?:x-retry-after|retry-after-.+)$/

/** The wait one of those headers carries, in seconds, or `null`. */
function waitNamedAnotherWay(response: Response): string | null {
  const headers = response.getHeaders()
  for (const [name, value] of Object.entries(headers)) {
    if (!OTHER_NAMES.test(name)) continue
    // An array is what `res.append` builds; the first entry is the wait, and a
    // second would be a duplicate of one fact rather than a second fact.
    const one = Array.isArray(value) ? value[0] : value
    if (one !== undefined && String(one) !== '') return String(one)
  }
  return null
}

/**
 * Middleware adding `Retry-After` to a 429 that named the wait some other way.
 *
 * **Every refusal, rather than each limiter separately.** Three answer with
 * this status - nginx at the edge, the throttler's guard, and Better Auth on
 * the credential routes - and only the first sent the registered name. A rule
 * stated in one limiter reaches that limiter; stated here it reaches whichever
 * of them answered, and the next one nobody has written yet.
 *
 * **Added, never replacing.** The suffixed name says *which tier* refused,
 * which a caller reading one header cannot otherwise know.
 *
 * **`writeHead` is where it runs, because the decision needs the status.** A
 * middleware runs before the handler, when nothing has refused anything yet;
 * `writeHead` is the last point at which the headers are still mutable, and it
 * is called on every path out, `res.end` included, through Node's implicit
 * header write.
 */
export function retryAfterOnEveryRefusal(): RequestHandler {
  return (_request, response, next) => {
    const original = response.writeHead.bind(response)
    response.writeHead = function patched(
      ...args: Parameters<Response['writeHead']>
    ): Response {
      if (response.statusCode === 429 && response.getHeader(STANDARD) === undefined) {
        const wait = waitNamedAnotherWay(response)
        if (wait !== null) response.setHeader(STANDARD, wait)
      }
      return original(...args)
    } as Response['writeHead']
    next()
  }
}
