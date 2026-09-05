/**
 * `GET /api/setup` and `POST /api/setup` - claiming a fresh install.
 *
 * **Public, both of them, and they have to be**: nobody can hold a session on
 * an install with no accounts. The setup token, printed to the console the
 * server runs in, stands in for authentication.
 *
 * **Unclaimed means no accounts at all**, never "no administrator". An install
 * with one analyst and no administrator is a different problem, recoverable
 * only at the database - rescuing it here would let anyone who reaches the port
 * mint an administrator on a *running* install.
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
     * **The same rule as `password`, stated rather than implied.** A bare
     * `string` here says the repeat may be anything, which is false - it must
     * be a password. It also makes the pair expressible: the cross-field
     * check is a `refine` and cannot appear in the published schema, so a
     * caller generating a body from the document produced two different
     * strings and was refused by a rule the document does not carry.
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
   *
   * **Call it from `main.ts`, never from a lifecycle hook**: a hook runs in
   * every process that builds this module, including the one-shot `seed` entry,
   * which would print a live token into a Job's logs.
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
   * **`@Public()`, and it has to be.** Nobody can hold a session on an install
   * with no accounts, so a guarded setup route is a door that only opens from
   * inside the room it lets you into.
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
   *
   * **Delegated to Better Auth's own sign-up**, not written here. Hashing,
   * the session cookie and the account row are its job; a second creation path
   * is a second place for the password rules to be almost right.
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
     * **Re-read, never trusted from boot.** The token is minted once at
     * startup; whether the install is still unclaimed is a fact about *now*,
     * and two people racing the setup screen is exactly when it changes.
     */
    if (!(await this.unclaimed())) {
      throw new ForbiddenException('This install already has an account.')
    }
    if (!matchesToken(this.token, body.token)) {
      throw new ForbiddenException('That is not this install\u2019s setup token.')
    }

    /**
     * **In process, never over the loopback.** A POST to this server's own
     * `/api/auth/sign-up/email` has to satisfy the origin check and, behind
     * TLS, a certificate `fetch` will not accept - for something the library
     * exposes directly. `asResponse` is what carries the `set-cookie` back.
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
     *
     * **The `where` is load-bearing.** Without it this promotes every row -
     * harmless only while the install genuinely had no accounts, and a
     * privilege escalation the moment two callers race the check above.
     */
    await this.db.update(user).set({ role: ADMIN_ROLE }).where(sameAddress(body.username))
    this.token = null
    this.log.log('This install has been claimed; the setup token is now void.')
    return { claimed: true }
  }
}
