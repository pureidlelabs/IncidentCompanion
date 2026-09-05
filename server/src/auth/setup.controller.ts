/**
 * `GET /api/setup` and `POST /api/setup` - claiming a fresh install.
 */
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  Post,
  Body,
  Res,
} from '@nestjs/common'
import { count } from 'drizzle-orm'
import { z } from 'zod'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import type { Response } from 'express'
import { AuthService, Public } from '@thallesp/nestjs-better-auth'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { sameAddress } from './same-address.js'
import { user } from '../db/schema/auth.js'
import { ADMIN_ROLE, type Auth } from './auth.config.js'
import { matchesToken, mintToken } from './setup.token.js'
import { MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from './password-policy.js'

const unclaimedSchema = z.object({
  /** True while the install has no accounts and may still be claimed. */
  unclaimed: z.boolean(),
})

export class UnclaimedDto extends createZodDto(unclaimedSchema) {}

/**
 * **`repeat` is checked here as well as in the form.** The form's check is a
 * courtesy; this one is the rule, because the route is reachable without it.
 */
const claimSchema = z
  .object({
    token: z.string().min(1),
    username: z.string().trim().email(),
    password: z.string().min(MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT).max(200),
    /**
     * **The same rule as `password`, stated rather than implied.**
     */
    repeat: z.string().min(MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT).max(200),
  })
  .refine((body) => body.password === body.repeat, {
    message: 'The two passwords are not the same.',
    path: ['repeat'],
  })

export class ClaimDto extends createZodDto(claimSchema) {}

const claimedSchema = z.object({ claimed: z.boolean() })
export class ClaimedDto extends createZodDto(claimedSchema) {}

@Controller('api/setup')
export class SetupController {
  private readonly log = new Logger('Setup')

  /** Null once the install is claimed, which is what makes the gate close. */
  private token: string | null = null

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly auth: AuthService<Auth>,
  ) {}

  /**
   * Mints the setup token, but only while the install has no accounts - a token
   * on a claimed install is a credential with no purpose.
   */
  async mintIfUnclaimed(): Promise<void> {
    if (!(await this.unclaimed())) return
    this.token = mintToken()
    this.log.warn(
      `This install has no accounts. Claim it at /setup with this token: ${this.token}`,
    )
  }

  private async unclaimed(): Promise<boolean> {
    const [row] = await this.db.select({ how: count() }).from(user)
    return (row?.how ?? 0) === 0
  }

  /**
   * **`@Public()`, and it has to be.**
   */
  @Public()
  @Get()
  @ZodResponse({
    status: 200,
    type: UnclaimedDto,
    description: 'Whether this install still has no accounts and can be claimed.',
  })
  async state(): Promise<z.infer<typeof unclaimedSchema>> {
    return { unclaimed: await this.unclaimed() }
  }

  /**
   * Create the first administrator and sign in as them.
   */
  @Public()
  @Post()
  @ZodResponse({
    status: 200,
    type: ClaimedDto,
    description: 'Claims an unclaimed install, creating its first administrator.',
  })
  async claim(
    @Body() body: ClaimDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<z.infer<typeof claimedSchema>> {
    /**
     * **Re-read, never trusted from boot.**
     */
    if (!(await this.unclaimed())) {
      throw new ForbiddenException('This install already has an account.')
    }
    if (!matchesToken(this.token, body.token)) {
      throw new ForbiddenException('That is not this install\u2019s setup token.')
    }

    /**
     * **In process, never over the loopback.**
     */
    const signedUp = await this.auth.api.signUpEmail({
      body: { email: body.username, password: body.password, name: body.username },
      asResponse: true,
    })
    if (!signedUp.ok) {
      throw new BadRequestException(`The account could not be created: ${await signedUp.text()}`)
    }

    // **The cookie is forwarded, so claiming signs you in.** Otherwise the
    // operator sets a password and is handed the sign-in form to type it into.
    const cookie = signedUp.headers.get('set-cookie')
    if (cookie) response.setHeader('set-cookie', cookie)

    /**
     * **Promoted by a direct write**, because `createUser` needs an admin
     * session to call and this is the bootstrap that produces the first one.
     */
    await this.db.update(user).set({ role: ADMIN_ROLE }).where(sameAddress(body.username))
    this.token = null
    this.log.log('This install has been claimed; the setup token is now void.')
    return { claimed: true }
  }
}
