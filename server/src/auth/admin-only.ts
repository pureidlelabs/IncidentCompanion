/**
 * Admin-only, enforced and published by the same line.
 *
 * **Use this rather than `@Roles([ADMIN_ROLE])`**, which refuses an analyst and
 * tells nobody: the operation then publishes no `403`, so a caller reading the
 * reference cannot learn which routes they may not use and a generated client
 * has no branch for it.
 *
 * In `auth/` and not `wire/` because `wire` is a leaf that may reach nothing -
 * `architecture.test.ts` decides that.
 */
import { applyDecorators } from '@nestjs/common'
import { ApiForbiddenResponse } from '@nestjs/swagger'
import { Roles } from '@thallesp/nestjs-better-auth'

import { ADMIN_ROLE } from './auth.config.js'

export function AdminOnly(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    Roles([ADMIN_ROLE]),
    ApiForbiddenResponse({
      description:
        'Not an administrator. Also answered when the account has not yet set its own password.',
    }),
  )
}
