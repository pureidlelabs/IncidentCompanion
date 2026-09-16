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
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { AuthService } from '@thallesp/nestjs-better-auth'

import { AdminOnly } from '../auth/admin-only.js'
import { refused, written as done, type Written } from '../domain/written.js'

import { fromNodeHeaders } from 'better-auth/node'
import type { IncomingHttpHeaders } from 'node:http'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { ACCOUNT_STATES, ADMIN_ROLE, DEFAULT_ROLE, ROLES } from '../domain/analyst-account.js'
import { type Auth } from '../auth/auth.config.js'
import { PasswordHoldService } from '../auth/password-hold.service.js'
import { LockoutClearService } from '../auth/lockout-clear.service.js'
import { callerLast, duplicateEmail, rowFor } from './rules.js'
import { AccountLookupService } from '../auth/account-lookup.service.js'
import { stranding, type Analyst } from '../auth/last-admin.js'
import { MINIMUM_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from '../auth/password-policy.js'
import { Caller } from '../install-activity/caller.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'

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
 * The body of a route that takes none.
 *
 * **Refused rather than ignored.** A route that answers 200 to a body nobody
 * could mean tells the caller it was understood, and the caller believes it.
 * -> `test/malformed-requests.test.ts`
 */
const noBodySchema = z.object({}).strict()

/**
 * How many times the sweep re-reads before it gives up.
 *
 * Two would do on any install nobody is signing into; the third is what
 * turns a sweep that cannot finish into a refusal rather than a loop.
 */
const PASSES = 3

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
  state: z.enum(ACCOUNT_STATES),
  tone: z.enum(['positive', 'negative']),
  disabled: z.boolean(),
})

/** A 422 carrying the sentence, which is what `postWritten` unwraps. */
function refuse(...texts: string[]): never {
  throw new UnprocessableEntityException(refused(...texts))
}

class AccountWrittenDto extends createZodDto(writtenSchema) {}
class AccountsDto extends createZodDto(
  z.object({
    accounts: z.array(accountRowSchema),
    roles: z.array(z.enum(ROLES)),
    defaultRole: z.enum(ROLES),
  }),
) {}

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
    private readonly accounts: AccountLookupService,
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

  // Above every `:username` route: Nest matches in declaration order, so a
  // two-segment `:username/<verb>` added later would swallow this one and then
  // refuse `end` as an address nobody holds.
  @Post('sessions/end')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AccountWrittenDto, description: 'Every session was ended.' })
  async endEverySession(@Body() body: unknown, @Caller() caller: Caller): Promise<Written> {
    if (!noBodySchema.safeParse(body ?? {}).success) refuse('Ending every session takes no body.')

    /**
     * **Swept until nothing holds a session, not once.** A sign-in landing
     * between the read and the revocation survives a single pass, and the
     * answer would still say every session ended. `PASSES` bounds it because an
     * install signing in faster than this loop revokes is a different problem
     * and an unbounded loop is not its answer.
     */
    let ended = 0
    for (let pass = 0; pass < PASSES; pass += 1) {
      const holders = await this.accounts.withAnOpenSession()
      if (holders.length === 0) break
      // Earlier passes have already signed people out, so this says what
      // happened rather than that nothing did.
      if (pass === PASSES - 1) {
        refuse(
          `Sessions are being opened faster than they can be ended. ${String(ended)} were signed ` +
            'out and some remain.',
        )
      }
      for (const userId of callerLast(holders, caller.session.user.id)) {
        await this.endOneAccountsSessions(caller, userId)
        ended += 1
      }
    }

    await this.activity.everySessionEnded(caller, ended)
    return done(
      ended === 1
        ? 'One analyst was signed out, including you.'
        : `${String(ended)} analysts were signed out, including you.`,
    )
  }

  /**
   * Records that an account's sessions ended, then ends them.
   *
   * **That order, and a refusal when the line does not land.** The audit
   * swallows a failed write everywhere else, so acting first would let a sweep
   * sign an analyst out with nothing saying it happened.
   * -> `openspec/constitution.md`
   */
  private async endOneAccountsSessions(caller: Caller, userId: string): Promise<void> {
    const who = await this.accounts.byId(userId)
    const landed = await this.activity.sessionsEnded(caller, who?.email ?? userId)
    if (!landed) {
      throw new ServiceUnavailableException({
        message: 'The audit could not record this, so no session was ended.',
      })
    }
    await this.auth.api.revokeUserSessions({
      body: { userId },
      headers: this.headersOf(caller),
    })
  }

  @Post()
  @ZodResponse({ status: 201, type: AccountWrittenDto, description: 'The account was created.' })
  async create(
    @Body() body: unknown,
    @Caller() caller: Caller,
  ): Promise<Written> {
    const parsed = createSchema.safeParse(body ?? {})
    if (!parsed.success) {
      refuse(...parsed.error.issues.map((one) => one.message))
    }
    const { username, displayName, password, role } = parsed.data

    /**
     * **No read in front of this, because a read cannot answer it.** Two
     * admins pressing Create at the same moment both see no such account, and
     * the second is refused by the database - which surfaced as `500 Internal
     * server error` before the catch below existed. A reader here would also
     * have to fold case to be right about it, which is a second place to get
     * that wrong. -> `db/schema/auth.ts`
     */
    try {
      await this.auth.api.createUser({
        body: { email: username, password, name: displayName, role },
        headers: this.headersOf(caller),
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
    await this.activity.accountCreated(caller, username, role)
    return done(`${displayName} can now sign in and will set their own password.`)
  }

  @Post(':username/reset')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AccountWrittenDto, description: 'A new password was issued.' })
  async reset(
    @Param('username') username: string,
    @Body() body: unknown,
    @Caller() caller: Caller,
  ): Promise<Written> {
    const parsed = resetSchema.safeParse(body ?? {})
    if (!parsed.success) {
      refuse(...parsed.error.issues.map((one) => one.message))
    }
    const target = await this.accounts.byAddress(username)
    if (!target) refuse(`No account for ${username}.`)

    await this.auth.api.setUserPassword({
      body: { userId: target.id, newPassword: parsed.data.password },
      headers: this.headersOf(caller),
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
    // **The account, not the keystrokes.** `target_label` is a copied address
    // and the table is append-only, so a line naming a spelling no row holds
    // cannot be corrected and an auditor filtering for that account never sees
    // it. -> `db/schema/install-activity.ts`
    await this.activity.passwordReset(caller, target.email)
    return done(`${username} will set their own password at the next sign-in.`)
  }

  /**
   * Every session the account holds, not whichever one an administrator saw.
   *
   * The requirement is about the analyst rather than about a cookie: ending one
   * of two leaves them working from the other, which is the scenario failing
   * while the route reports success.
   */
  @Post(':username/sessions/end')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AccountWrittenDto, description: "The account's sessions were ended." })
  async endSessions(
    @Param('username') username: string,
    @Body() body: unknown,
    @Caller() caller: Caller,
  ): Promise<Written> {
    if (!noBodySchema.safeParse(body ?? {}).success) {
      refuse("Ending an account's sessions takes no body.")
    }
    const target = await this.accounts.byAddress(username)
    if (!target) refuse(`No account for ${username}.`)

    await this.endOneAccountsSessions(caller, target.id)
    return done(`${username} has been signed out everywhere.`)
  }

  /**
   * Refuses two cases this install owns rather than authentication: an admin
   * disabling themselves, and disabling the last admin who can still sign in.
   * -> `stranding`
   */
  @Post(':username/disable')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AccountWrittenDto, description: 'The account state was changed.' })
  async disable(
    @Param('username') username: string,
    @Caller() caller: Caller,
  ): Promise<Written> {
    // **Administrators rather than a page of everybody.** `stranding` decides
    // by counting within what it is handed, and `listUsers` caps at 500 - so a
    // roster page that happened to exclude the target answered that no
    // administrator remains. -> `auth/account-lookup.service.ts`
    const everyone = await this.accounts.administrators()
    const target = await this.accounts.byAddress(username)
    if (!target) refuse(`No account for ${username}.`)
    // Compared by id, because that is what identifies an account. An address
    // is how one is reached, and a comparison of two of them is a lookup
    // wearing the shape of an identity check.
    if (target.id === caller.session.user.id) {
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
      headers: this.headersOf(caller),
    })
    await this.activity.accountDisabled(caller, target.email)
    return done(`${username} can no longer sign in.`)
  }

  @Post(':username/enable')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AccountWrittenDto, description: 'The account state was changed.' })
  async enable(
    @Param('username') username: string,
    @Caller() caller: Caller,
  ): Promise<Written> {
    const target = await this.accounts.byAddress(username)
    if (!target) refuse(`No account for ${username}.`)

    await this.auth.api.unbanUser({
      body: { userId: target.id },
      headers: this.headersOf(caller),
    })
    await this.activity.accountEnabled(caller, target.email)
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
  @ZodResponse({ status: 200, type: AccountWrittenDto, description: 'The role was changed.' })
  async role(
    @Param('username') username: string,
    @Body() body: unknown,
    @Caller() caller: Caller,
  ): Promise<Written> {
    const parsed = roleSchema.safeParse(body ?? {})
    if (!parsed.success) {
      refuse(...parsed.error.issues.map((one) => one.message))
    }

    // **Administrators rather than a page of everybody.** `stranding` decides
    // by counting within what it is handed, and `listUsers` caps at 500 - so a
    // roster page that happened to exclude the target answered that no
    // administrator remains. -> `auth/account-lookup.service.ts`
    const everyone = await this.accounts.administrators()
    const target = await this.accounts.byAddress(username)
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
      headers: this.headersOf(caller),
    })
    await this.activity.roleChanged(caller, target.email, from, parsed.data.role)
    const named = parsed.data.role === ADMIN_ROLE ? 'an administrator' : 'an analyst'
    return done(`${username} is now ${named}.`)
  }

}
