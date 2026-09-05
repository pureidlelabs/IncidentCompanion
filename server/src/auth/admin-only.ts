/**
 * Admin-only, enforced and published by the same line.
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
