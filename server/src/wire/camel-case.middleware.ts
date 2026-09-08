/**
 * Rewrites an incoming body's keys before anything validates it - middleware
 * rather than a pipe, because Nest runs middleware first unconditionally.
 *
 * `/api/auth` and a language-pack upload are skipped: Better Auth owns its own
 * request shapes, and a pack's `strings` are a map whose keys are the data.
 */
import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

import { camelKeys } from './naming.js'

/**
 * The route pattern that means "everything", spelled for Express 5 - a bare
 * `*` raises *"Missing parameter name at index 1"*.
 *
 * Exported so `app.module.ts` cannot spell it differently from the test.
 */
export const ALL_ROUTES = '{*path}'

/**
 * Paths whose bodies are not made of field names.
 *
 * A prefix list rather than a decorator: middleware runs before Nest has
 * resolved a handler, so there is nothing to read metadata off yet.
 */
const UNCONVERTED = ['/api/auth', '/api/report/languages']

/**
 * The path a target names, whatever form the caller wrote it in.
 *
 * **`originalUrl`, never `path`.** Middleware applied through `forRoutes` is
 * mounted on a router, so the matched prefix is stripped from `req.path` and
 * put in `req.baseUrl` -- `path` is `/` here for every request, and a skip
 * written against it matches nothing and says so nowhere: the auth bodies it
 * should have skipped are already camelCase.
 *
 * **But `originalUrl` is the caller's string, so it is parsed rather than
 * read.** An absolute-form target is routed exactly as an origin-form one and
 * carries its authority -- measured, `PUT http://host/api/report/languages`
 * answers 200 with `originalUrl` at `http://host/api/report/languages`, which
 * begins with no prefix here. Lowercased for the same reason: routing is
 * case-insensitive unless an install asks otherwise, and this one does not.
 *
 * A target that will not parse is handed back as it came, so it is matched no
 * more loosely than before.
 */
function pathOf(target: string): string {
  try {
    return new URL(target, 'http://placeholder.invalid').pathname.toLowerCase()
  } catch {
    return target.toLowerCase()
  }
}

/**
 * Whether a path is one of the unconverted ones, by segment.
 *
 * **A prefix is not a path.** `startsWith` alone skips `/api/authors` because
 * it begins with `/api/auth`, and `/api/report/languages-of-record` because it
 * begins with the pack route -- so a route nobody has written yet inherits a
 * skip nobody chose. The boundary has to be the separator.
 */
function skipped(path: string): boolean {
  return UNCONVERTED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

@Injectable()
export class CamelCaseBodyMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (skipped(pathOf(req.originalUrl))) return next()
    if (req.body && typeof req.body === 'object') {
      req.body = camelKeys(req.body)
    }
    next()
  }
}
