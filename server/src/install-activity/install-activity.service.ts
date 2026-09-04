/**
 * The audit's facade: one named method per thing this install can have done.
 *
 * **A method per event, not a `record({ event, detail })`.** The free-form
 * version made the attribute bag a convention - `{ from, to }` on a role
 * change was correct because every call site happened to spell it that way,
 * and nothing checked. The only guard was a grep for the word `password`,
 * which is what a test looks like when the type system has been given nothing
 * to work with.
 *
 * So each method takes what its event actually needs, and builds the
 * attributes itself. A call site cannot omit `from`, cannot misspell it, and
 * cannot put a password in - because it has nowhere to put one.
 *
 * **The actor is always a session, never a name.** Every route that writes
 * here holds the caller's own session; taking a string would let one be typed,
 * and "whoever is admin" is the attribution mistake this whole table exists to
 * prevent.
 */
import { Inject, Injectable } from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { NAMED } from './named.js'
import { recordInstallActivity, type InstallActivityInput } from './record.js'

/**
 * What a caller hands over: their own session and their own request.
 *
 * **Both, always.** The session answers *who*, the headers answer *from
 * where*, and a line missing either is one a reviewer cannot act on.
 */
export interface Caller {
  session: { user: { id: string; name?: string | null; email?: string | null } }
  headers: IncomingHttpHeaders
  /**
   * The request itself, so a named act can mark it accounted for.
   *
   * **Optional, because not every caller has one** - the boot line and Better
   * Auth's hooks have no request at all. Where it is present, `AuditInterceptor`
   * reads the mark and stays quiet, so one act is one line rather than a
   * precise line and a vague one.
   */
  request?: object | undefined
}

const actorOf = (caller: Caller) => ({
  id: caller.session.user.id,
  label: caller.session.user.name || caller.session.user.email || null,
})

@Injectable()
export class InstallActivityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * The unnamed door, for the boundary interceptor alone.
   *
   * **Not for a route.** A controller reaching for this is a controller
   * choosing its own attribute names, which is what the typed methods exist to
   * stop. The interceptor uses it because it records what it cannot name: a
   * request to a route it knows nothing about.
   */
  async record(input: InstallActivityInput): Promise<void> {
    await recordInstallActivity(this.db, input)
  }

  // --- Accounts ------------------------------------------------------------

  async accountCreated(caller: Caller, username: string, role: string): Promise<void> {
    // The role is on the line because privilege assignment is the half of
    // "account created" that still matters six months later.
    await this.write('account_created', caller, username, { role })
  }

  async accountDisabled(caller: Caller, username: string): Promise<void> {
    await this.write('account_disabled', caller, username)
  }

  async accountEnabled(caller: Caller, username: string): Promise<void> {
    await this.write('account_enabled', caller, username)
  }

  /**
   * **`from` is a parameter because it has to be read before the write.** A
   * role line that cannot say what it changed *from* answers half the question
   * somebody opens the audit with, and after the write there is nothing left
   * to read it from.
   */
  async roleChanged(caller: Caller, username: string, from: string, to: string): Promise<void> {
    await this.write('account_role_changed', caller, username, { from, to })
  }

  /**
   * **Takes no password and has nowhere to put one.** That is the whole
   * argument for these methods: the untyped bag needed a test that grepped for
   * the word.
   */
  async passwordReset(caller: Caller, username: string): Promise<void> {
    await this.write('account_password_reset', caller, username)
  }

  // --- The customer directory ----------------------------------------------

  async customerCreated(
    caller: Caller,
    customerId: string,
    detail: { name: string },
  ): Promise<void> {
    await this.write('customer_created', caller, customerId, detail)
  }

  /**
   * **The fields, not their values.** An organisation's competent authority
   * and its DPO's contact are the sort of thing an audit line should say
   * *changed* rather than reproduce, and a line naming only the record answers
   * nothing about what moved.
   */
  async customerChanged(
    caller: Caller,
    customerId: string,
    detail: { fields: string },
  ): Promise<void> {
    await this.write('customer_changed', caller, customerId, detail)
  }

  /**
   * **The name, for `caseDeleted`'s reason**: afterwards there is no row left
   * to join to, and a line naming a bare uuid answers nothing to somebody
   * reading the log. The id goes in the detail, where it is still the thing
   * another line can be matched on.
   */
  async customerRemoved(
    caller: Caller,
    customerId: string,
    name: string,
  ): Promise<void> {
    await this.write('customer_removed', caller, name, { customerId })
  }

  /**
   * **Held against the survivor, naming the record that went.** After a merge
   * the losing id resolves to nothing, so a line held against it would be the
   * one nobody can look up -- and for the same reason the losing record's
   * name travels with its id.
   */
  async customersMerged(
    caller: Caller,
    surviving: string,
    detail: { losing: string; losingName: string },
  ): Promise<void> {
    await this.write('customers_merged', caller, surviving, detail)
  }

  // --- Reach ---------------------------------------------------------------

  async groupCreated(caller: Caller, groupId: string, detail: { name: string }): Promise<void> {
    await this.write('group_created', caller, groupId, detail)
  }

  /**
   * **The analyst is the subject and the group is a detail.** An auditor asks
   * what somebody was given, so the name they search by is the one in the
   * subject column; the group answers *through what*.
   */
  async reachGranted(
    caller: Caller,
    userId: string,
    detail: { groupId: string; level: string },
  ): Promise<void> {
    await this.write('reach_granted', caller, userId, detail)
  }

  async reachRevoked(caller: Caller, userId: string, detail: { groupId: string }): Promise<void> {
    await this.write('reach_revoked', caller, userId, detail)
  }

  /**
   * The customer is the subject here, not an analyst: moving one in or out of
   * a group changes who reaches it without granting anything to anybody by
   * name.
   */
  async groupHeldCustomer(
    caller: Caller,
    customerId: string,
    detail: { groupId: string },
  ): Promise<void> {
    await this.write('group_held_customer', caller, customerId, detail)
  }

  async groupReleasedCustomer(
    caller: Caller,
    customerId: string,
    detail: { groupId: string },
  ): Promise<void> {
    await this.write('group_released_customer', caller, customerId, detail)
  }

  // --- Cases ---------------------------------------------------------------

  /**
   * **The title, because `change_feed` cascades with the case.** After a
   * delete there is no row left to join to, and a line naming a bare uuid
   * answers nothing.
   */
  async caseCreated(caller: Caller, caseId: string, title: string): Promise<void> {
    await this.write('case_created', caller, title, { caseId })
  }

  async caseDeleted(caller: Caller, caseId: string, title: string): Promise<void> {
    await this.write('case_deleted', caller, title, { caseId })
  }

  /**
   * **Both customers, because either one alone answers the wrong question.**
   * An auditor asking why an analyst stopped reaching a case needs the record
   * it left; one asking what a customer holds needs the record it arrived at.
   *
   * The title is the target for the reason `caseCreated` uses it: a line
   * naming a bare uuid answers nothing to somebody reading the log.
   */
  async caseAttributed(
    caller: Caller,
    caseId: string,
    title: string,
    detail: { from: string | null; to: string },
  ): Promise<void> {
    await this.write('case_attributed', caller, title, {
      caseId,
      // A case that named nobody says so, rather than omitting the key: an
      // absent `from` reads as a line that forgot to record it.
      from: detail.from ?? 'none',
      to: detail.to,
    })
  }

  // --- The installation ----------------------------------------------------

  async regimeSwitched(caller: Caller, regime: string, enabled: boolean): Promise<void> {
    // Which way it went: "regime switched" alone says a setting moved and not
    // what the install is now claiming to be subject to.
    await this.write('regime_switched', caller, regime, { enabled: String(enabled) })
  }

  async languageUploaded(
    caller: Caller,
    code: string,
    label: string,
    ignored: number,
  ): Promise<void> {
    // The ignored count, because a pack stored at 40% renders a mostly English
    // report under another language's name.
    await this.write('report_language_uploaded', caller, code, {
      label,
      ignored: String(ignored),
    })
  }

  async languageRemoved(caller: Caller, code: string): Promise<void> {
    await this.write('report_language_removed', caller, code)
  }

  async libraryKindReplaced(
    caller: Caller,
    slug: string,
    entries: number,
    disabledBuiltins: number,
  ): Promise<void> {
    // This route replaces a kind wholesale and the document is not kept, so
    // without these the line says the library changed and nothing about what to.
    await this.write('library_kind_replaced', caller, slug, {
      entries: String(entries),
      disabledBuiltins: String(disabledBuiltins),
    })
  }

  /**
   * The retention window moved.
   *
   * **Both numbers, because the direction is the whole story.** Lengthening is
   * housekeeping; shortening destroys evidence, and a line saying only "the
   * window changed" cannot tell a reviewer which happened.
   */
  async retentionChanged(caller: Caller, from: number, to: number): Promise<void> {
    await this.write('audit_retention_changed', caller, null, {
      from: String(from),
      to: String(to),
    })
  }

  /**
   * One install setting changed, whatever it was.
   *
   * **Generic, with the key in the detail.** Ten settings that are all "an
   * administrator changed a bound" do not want ten enum values, ten OCSF
   * mappings and ten severity rules; the act is one thing and the key is what
   * discriminates it. The level is derived from the key and the direction, so
   * loosening a bound cannot be filed as quietly as tightening it.
   *
   * **`from` and `to` are both recorded**, because a line saying only what a
   * setting became cannot answer whether it was loosened.
   */
  async settingChanged(caller: Caller, key: string, from: unknown, to: unknown): Promise<void> {
    await this.write('setting_changed', caller, key, {
      key,
      from: String(from),
      to: String(to),
    })
  }

  /** Reading the audit. Rate-limited by its caller, not here. */
  async auditRead(caller: Caller): Promise<void> {
    await this.write('audit_read', caller, null)
  }

  private async write(
    event: InstallActivityInput['event'],
    caller: Caller,
    target: string | null,
    detail?: Record<string, string>,
  ): Promise<void> {
    const landed = await recordInstallActivity(this.db, {
      event,
      actor: actorOf(caller),
      target,
      ...(detail ? { detail } : {}),
      headers: caller.headers,
    })

    /**
     * **The mark follows the write, and only a successful one.**
     *
     * Marking first was a way for an act to be recorded *nowhere*: the audit
     * swallows a failed write by design, so the mark stood, the boundary
     * deferred, and a role change left no line anywhere. A vaguer line from
     * the boundary is a great deal better than none.
     */
    if (landed && caller.request) (caller.request as Record<symbol, boolean>)[NAMED] = true
  }
}
