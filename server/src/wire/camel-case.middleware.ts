/**
 * Rewrites an incoming body's keys before anything validates it - middleware
 * rather than a pipe, because Nest runs middleware first unconditionally.
 */
import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

import { camelKeys } from './naming.js'

/**
 * The route pattern that means "everything", spelled for Express 5 - a bare
 * `*` raises *"Missing parameter name at index 1"*.
 */
export const ALL_ROUTES = '{*path}'

/**
 * Paths whose bodies are not made of field names.
 */
const UNCONVERTED = ['/api/auth', '/api/report/languages']

@Injectable()
export class CamelCaseBodyMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    // **`originalUrl`, never `path`.** Middleware applied through `forRoutes`
    // is mounted on a router, so Express strips the matched prefix from
    // `req.path` and puts it in `req.baseUrl` -- `path` is `/` here for every
    // request, and a skip written against it matches nothing. Both skips were
    // inert for exactly this reason, and the auth one was invisible because
    // Better Auth's fields are already camelCase.
    const target = req.originalUrl
    if (UNCONVERTED.some((prefix) => target.startsWith(prefix))) return next()
    if (req.body && typeof req.body === 'object') {
      req.body = camelKeys(req.body)
    }
    next()
  }
}
