/**
 * `/api/accounts` - the install's analyst accounts.
 *
 * Better Auth's admin plugin does the work: list, create, set a password and
 * ban are its endpoints, and its ban is what also revokes the analyst's live
 * sessions. What is here is a projection into the row shape the pane reads,
 * and two refusals no library owns.
 *
 * Admin-only at the class, so a route added later cannot forget it.
 *
 * **`Install`, because `operationId` is `ClassName_methodName`.** The case's
 * own accounts collection is an `AccountsController` too, and two of that
 * name publish one id for two operations. -> `test/openapi-document.test.ts`
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common'
import { AuthService, Session, type UserSession } from '@thallesp/nestjs-better-auth'

import { AdminOnly } from '../auth/admin-only.js'
import { fromNodeHeaders } from 'better-auth/node'
import type { IncomingHttpHeaders } from 'node:http'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { ADMIN_ROLE, DEFAULT_ROLE, ROLES, type Auth } from '../auth/auth.config.js'
import { PasswordHoldService } from '../auth/password-hold.service.js'
import { LockoutClearService } from '../auth/lockout-clear.service.js'
import { duplicateEmail, rowFor, type Analyst } from './rules.js'
import { stranding } from '../auth/last-admin.js'
import { MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from '../auth/password-policy.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'

/** `[text, level]` - the level is second, as every refusal in this app spells it. */
type Message = [string, string]

interface Written {
  ok: boolean
  messages: Message[]
}

/**
 * **A refusal is a 422 carrying the sentence, not a 200 saying `ok: false`.**
 *
 * `postWritten` unwraps either, so both *work* - which is exactly why they
 * drift. The library editor already answers 422, and a POST that refuses
 * while returning "201 Created" is wrong to anything reading the status
 * rather than the body: a proxy, a log, or the API door this app will grow
 * again later.
 */
function refuse(...texts: string[]): never {
  throw new UnprocessableEntityException({
    ok: false,
    messages: texts.map((text) => [text, 'negative']),
  })
}

function done(text: string): Written {
  return { ok: true, messages: [[text, 'positive']] }
}

/**
 * **`username` is the email**, because that is the identity an analyst signs in
 * with. Better Auth's credential account is keyed on email, and a second
 * identifier beside it would mean two things to keep unique and one of them
 * decorative.
 */
const createSchema = z
  .object({
    username: z.email('An account is created with an email address.'),
    displayName: z.string().trim().min(1, 'An account needs a name.').max(120),
    password: z.string().min(MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT).max(200),
    role: z.enum(ROLES).default(DEFAULT_ROLE),
  })
  .strict()

const resetSchema = z
  .object({ password: z.string().min(MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT).max(200) })
  .strict()

/**
 * **`z.enum(ROLES)`, so a role this app does not have is a refusal rather
 * than a stored string.** Better Auth's own route coerces its input, which
 * is how an array-wrapped id reached its handler as an id.
 */
const roleSchema = z.object({ role: z.enum(ROLES) }).strict()

/**
 * What the account routes answer with.
 *
 * **`ok: boolean`, not `z.literal(true)`.** A refusal here is a 422 carrying
 * the sentence, so a 200 always means it worked - but the shape is shared with
 * `postWritten`, which unwraps either, and narrowing it to `true` would publish
 * a promise the type does not make.
 */
const messageSchema = z.tuple([z.string(), z.string()])
const writtenSchema = z.object({ ok: z.boolean(), messages: z.array(messageSchema) })
const accountRowSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  role: z.enum(ROLES),
  state: z.enum(['active', 'disabled']),
  tone: z.enum(['positive', 'negative']),
  disabled: z.boolean(),
})

class AccountsDto extends createZodDto(
  z.object({
    accounts: z.array(accountRowSchema),
    roles: z.array(z.enum(ROLES)),
    defaultRole: z.enum(ROLES),
  }),
) {}
class WrittenDto extends createZodDto(writtenSchema) {}

@AdminOnly()
@Controller('api/accounts')
export class InstallAccountsController {
  /**
   * **Typed with this install's own `Auth`.** `AuthService`'s default generic
   * is a plugin-less instance, so `listUsers` and the rest are simply not on
   * it - the admin endpoints exist at runtime and vanish at compile time. The
   * generic is erased before Nest sees it, so injection is unaffected.
   */
  constructor(
    private readonly auth: AuthService<Auth>,
    private readonly holds: PasswordHoldService,
    private readonly lockouts: LockoutClearService,
    private readonly activity: InstallActivityService,
  ) {}

  private headersOf(request: { headers: IncomingHttpHeaders }) {
    return fromNodeHeaders(request.headers)
  }

  private async users(request: { headers: IncomingHttpHeaders }): Promise<Analyst[]> {
    const answer = (await this.auth.api.listUsers({
      // The pane shows the whole install; there is no paging in it and an
      // install with more analysts than this has other problems.
      query: { limit: 500, sortBy: 'email', sortDirection: 'asc' },
      headers: this.headersOf(request),
    })) as unknown as { users: Analyst[] }
    return answer.users
  }

  @Get()
  @ZodResponse({ status: 200, type: AccountsDto, description: 'Every account, with the roles an install offers.' })
  async list(@Req() request: { headers: IncomingHttpHeaders }) {
    return {
      accounts: (await this.users(request)).map((user) => rowFor(user)),
      roles: [...ROLES],
      defaultRole: DEFAULT_ROLE,
    }
  }

  @Post()
  @ZodResponse({ status: 201, type: WrittenDto, description: 'The account was created.' })
  async create(
    @Req() request: { headers: IncomingHttpHeaders },
    @Body() body: unknown,
    @Session() session: UserSession,
  ): Promise<Written> {
    const parsed = createSchema.safeParse(body ?? {})
    if (!parsed.success) {
      refuse(...parsed.error.issues.map((one) => one.message))
    }
    const { username, displayName, password, role } = parsed.data

    if ((await this.users(request)).some((one) => one.email === username)) {
      refuse(`There is already an account for ${username}.`)
    }

    /**
     * **The read above has a gap under it, and this is what closes it.** Two
     * admins pressing Create at the same moment both see no such account, and
     * the second reaches the unique constraint on `user.email` - which surfaced
     * as `500 Internal server error`. Checking harder cannot fix a
     * check-then-write; treating the constraint's complaint as the answer can.
     */
    try {
      await this.auth.api.createUser({
        body: { email: username, password, name: displayName, role },
        headers: this.headersOf(request),
      })
    } catch (why) {
      if (duplicateEmail(why)) refuse(`There is already an account for ${username}.`)
      throw why
    }
    // **The password was chosen by whoever is filling in this form**, so the
    // account owes its own before it can do anything. Written here rather than
    // in a create hook, because that hook also fires for first-run sign-up -
    // where the person choosing the password is the person who will use it.
    await this.holds.hold(username)
    await this.activity.accountCreated({ session, headers: request.headers, request }, username, role)
    return done(`${displayName} can now sign in and will set their own password.`)
  }

  @Post(':username/reset')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: WrittenDto, description: 'A new password was issued.' })
  async reset(
    @Req() request: { headers: IncomingHttpHeaders },
    @Param('username') username: string,
    @Body() body: unknown,
    @Session() session: UserSession,
  ): Promise<Written> {
    const parsed = resetSchema.safeParse(body ?? {})
    if (!parsed.success) {
      refuse(...parsed.error.issues.map((one) => one.message))
    }
    const target = (await this.users(request)).find((one) => one.email === username)
    if (!target) refuse(`No account for ${username}.`)

    await this.auth.api.setUserPassword({
      body: { userId: target.id, newPassword: parsed.data.password },
      headers: this.headersOf(request),
    })
    // **A reset is the same situation as a create** - an admin knows the
    // password - so it takes the same hold. The property is "somebody else
    // chose this", which a reset satisfies exactly.
    await this.holds.hold(username)
    // **A reset that leaves the lockout standing hands the analyst a new
    // password that still does not work.** An administrator choosing the
    // password is stronger evidence than the account typing it correctly, so
    // the reset clears the counter the way a successful sign-in does.
    await this.lockouts.clear(username)
    // **The password is not on the line, and neither is its hash.** This
    // column is read by every admin and outlives the account it describes.
    await this.activity.passwordReset({ session, headers: request.headers, request }, username)
    return done(`${username} will set their own password at the next sign-in.`)
  }

  /**
   * Refuses two cases this install owns rather than authentication: an admin
   * disabling themselves, and disabling the last admin who can still sign in.
   * -> `stranding`
   */
  @Post(':username/disable')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: WrittenDto, description: 'The account state was changed.' })
  async disable(
    @Req() request: { headers: IncomingHttpHeaders },
    @Param('username') username: string,
    @Session() session: UserSession,
  ): Promise<Written> {
    const everyone = await this.users(request)
    const target = everyone.find((one) => one.email === username)
    if (!target) refuse(`No account for ${username}.`)
    if (target.email === session.user.email) {
      refuse('You cannot disable the account you are signed in with.')
    }
    // `null` is a disable: a demotion to nobody, asking the same question the
    // role change asks. -> `auth/last-admin.ts`
    if (stranding(everyone, target, null)) {
      refuse(
        `${username} is the last administrator who can sign in. Give somebody else the ` +
          'administrator role first.',
      )
    }

    await this.auth.api.banUser({
      body: { userId: target.id, banReason: 'Disabled from the Accounts pane.' },
      headers: this.headersOf(request),
    })
    await this.activity.accountDisabled({ session, headers: request.headers, request }, username)
    return done(`${username} can no longer sign in.`)
  }

  @Post(':username/enable')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: WrittenDto, description: 'The account state was changed.' })
  async enable(
    @Req() request: { headers: IncomingHttpHeaders },
    @Param('username') username: string,
    @Session() session: UserSession,
  ): Promise<Written> {
    const target = (await this.users(request)).find((one) => one.email === username)
    if (!target) refuse(`No account for ${username}.`)

    await this.auth.api.unbanUser({
      body: { userId: target.id },
      headers: this.headersOf(request),
    })
    await this.activity.accountEnabled({ session, headers: request.headers, request }, username)
    return done(`${username} can sign in again.`)
  }

  /**
   * **The app's door, because the library's is closed.** A rule enforced from
   * outside the endpoint has to guess the body shape and every path that acts;
   * here the account is resolved first, so `stranding` is asked about a value
   * this method holds. -> `auth/last-admin.ts`, `auth/auth.config.ts`
   */
  @Post(':username/role')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: WrittenDto, description: 'The role was changed.' })
  async role(
    @Req() request: { headers: IncomingHttpHeaders },
    @Param('username') username: string,
    @Body() body: unknown,
    @Session() session: UserSession,
  ): Promise<Written> {
    const parsed = roleSchema.safeParse(body ?? {})
    if (!parsed.success) {
      refuse(...parsed.error.issues.map((one) => one.message))
    }

    const everyone = await this.users(request)
    const target = everyone.find((one) => one.email === username)
    if (!target) refuse(`No account for ${username}.`)

    if (stranding(everyone, target, parsed.data.role)) {
      refuse(
        `${username} is the last administrator who can sign in. Give somebody else the ` +
          'administrator role first.',
      )
    }

    // **Read `from` before the write, or it is the value the write just set.**
    // A role line that cannot say what it changed *from* answers half the
    // question somebody opens the audit with.
    const from = target.role ?? ''
    await this.auth.api.setRole({
      body: { userId: target.id, role: parsed.data.role },
      headers: this.headersOf(request),
    })
    await this.activity.roleChanged(
      { session, headers: request.headers, request },
      username,
      from,
      parsed.data.role,
    )
    const named = parsed.data.role === ADMIN_ROLE ? 'an administrator' : 'an analyst'
    return done(`${username} is now ${named}.`)
  }

}
