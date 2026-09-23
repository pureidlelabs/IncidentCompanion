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
  Inject,
  UnprocessableEntityException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common'
import { AuthService, Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { fromNodeHeaders } from 'better-auth/node'
import type { IncomingHttpHeaders } from 'node:http'
import { APIError } from 'better-auth/api'
import { z } from 'zod'

import { PasswordHoldService } from './password-hold.service.js'
import type { Auth } from './auth.config.js'
import { MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT, refusePassword } from './password-policy.js'
import { readPolicy } from '../policy/read.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { refusedBody } from '../domain/refusal.js'

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
  /**
   * The rule above holds between two fields, so no schema can state it and a
   * caller building a body from the published shape alone is refused by a rule
   * the document does not carry. The example is where the pair is shown.
   */
  .meta({
    examples: [
      {
        current: 'the-current-passphrase',
        password: 'the-replacement-passphrase',
        repeat: 'the-replacement-passphrase',
      },
    ],
  })

class ChangePasswordDto extends createZodDto(changeSchema) {}

class ChangedDto extends createZodDto(z.object({ changed: z.literal(true) })) {}

@Controller('api')
export class ChangePasswordController {
  constructor(
    private readonly auth: AuthService<Auth>,
    private readonly holds: PasswordHoldService,
    @Inject(DATABASE) private readonly db: Database,
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
      throw new UnprocessableEntityException(refusedBody(parsed.error))
    }

    // **The current password is verified by Better Auth.** It owns the hash and
    // its parameters; a comparison written here would be a second
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
    } catch (why) {
      /**
       * **The install's own minimum is answered as itself.** It is refused by
       * the `before` hook rather than by the schema above, because the number
       * is stored and a schema is built once -- so without this the analyst is
       * told their current password is wrong when what was wrong is the new
       * one, and no amount of retyping the right thing gets them through.
       * -> `auth.config.ts`, `PASSWORD_WRITES`
       */
      if (why instanceof APIError && why.status === 'UNPROCESSABLE_ENTITY') {
        /**
         * **The number is composed here and not in the hook**, because this
         * route is behind a session and the hook is not: it runs ahead of
         * every endpoint's own checks and does not know whom it answers. An
         * analyst changing their own password is owed the number; an
         * anonymous caller is not.
         */
        const stored = await readPolicy(this.db)
        throw new UnprocessableEntityException({
          message:
            refusePassword(parsed.data.password, stored['auth.minPasswordLength']) ??
            PASSWORD_TOO_SHORT,
        })
      }
      // Better Auth reports a wrong current password as a refusal; anything
      // else here is the same answer to the caller, who may not learn which
      // half failed. 422, not 401: the session is alive, and a client drops
      // its identity on a 401.
      throw new UnprocessableEntityException({ message: 'That is not the current password.' })
    }

    // **After the change, and unconditionally.** An account that was not being
    // forced writes `false` over `false`, which costs one statement and
    // removes the branch that could leave the hold in place on the one path
    // that matters.
    await this.holds.release(session.user.id)

    return { changed: true }
  }
}
