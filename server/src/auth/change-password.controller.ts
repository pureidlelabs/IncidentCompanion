/**
 * `POST /api/change-password` - the one route a held account may reach.
 *
 * **Ours rather than Better Auth's**, whose endpoint lives under `/api/auth/`
 * and takes different field names from the ones the client posts.
 *
 * **Clearing the hold is why this is a route and not a re-export.** The flag
 * has to fall in the same operation that replaces the password, or an account
 * that has just chosen one is still refused everywhere.
 */
import { ApiBody } from '@nestjs/swagger'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import {
  UnprocessableEntityException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { AuthService, Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { fromNodeHeaders } from 'better-auth/node'
import type { IncomingHttpHeaders } from 'node:http'
import { z } from 'zod'

import { PasswordHoldService } from './password-hold.service.js'
import type { Auth } from './auth.config.js'
import { MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from './password-policy.js'

/**
 * **`repeat` is checked here and not only in the browser.** A client that
 * skipped it would set a password its owner mistyped, and the account is then
 * locked out by the thing that was meant to protect it.
 */
const changeSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password.'),
    password: z.string().min(MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT),
    repeat: z.string().min(1, 'Repeat the new password.'),
  })
  .refine((fields) => fields.password === fields.repeat, {
    message: 'The two new passwords do not match.',
    path: ['repeat'],
  })

class ChangePasswordDto extends createZodDto(changeSchema) {}

class ChangedDto extends createZodDto(z.object({ changed: z.literal(true) })) {}

@Controller('api')
export class ChangePasswordController {
  constructor(
    private readonly auth: AuthService<Auth>,
    private readonly holds: PasswordHoldService,
  ) {}

  @Post('change-password')
  @ApiBody({ type: ChangePasswordDto, description: 'The current password and the new one.' })
  @HttpCode(200)
  @ZodResponse({ status: 200, type: ChangedDto, description: 'The password was replaced.' })
  async change(
    @Req() request: { headers: IncomingHttpHeaders },
    @Session() session: UserSession,
    @Body() body: unknown,
  ): Promise<{ changed: true }> {
    const parsed = changeSchema.safeParse(body ?? {})
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: parsed.error.issues.map((one) => one.message).join(' '),
      })
    }

    // **The current password is verified by Better Auth, not by us.** It owns
    // the hash and its parameters; a comparison written here would be a second
    // implementation of the one thing that must not have two.
    try {
      await this.auth.api.changePassword({
        body: {
          currentPassword: parsed.data.current,
          newPassword: parsed.data.password,
          // **Every other session stays.** Revoking them would sign the
          // analyst out of the second screen they have this case open on,
          // which is a surprise rather than a protection - the password was
          // changed *by* them, not against them.
          revokeOtherSessions: false,
        },
        headers: fromNodeHeaders(request.headers),
      })
    } catch {
      // Better Auth reports a wrong current password as a refusal; anything
      // else here is the same answer to the caller, who may not learn which
      // half failed.
      throw new UnauthorizedException({ message: 'That is not the current password.' })
    }

    // **After the change, and unconditionally.** An account that was not being
    // forced writes `false` over `false`, which costs one statement and
    // removes the branch that could leave the hold in place on the one path
    // that matters.
    await this.holds.release(session.user.id)

    return { changed: true }
  }
}
