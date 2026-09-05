/**
 * The audit's facade: one named method per thing this install can have done.
 */
import { Inject, Injectable } from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { NAMED } from './named.js'
import { recordInstallActivity, type InstallActivityInput } from './record.js'

/**
 * What a caller hands over: their own session and their own request.
 */
export interface Caller {
  session: { user: { id: string; name?: string | null; email?: string | null } }
  headers: IncomingHttpHeaders
  /**
   * The request itself, so a named act can mark it accounted for.
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
   * **`from` is a parameter because it has to be read before the write.**
   */
  async roleChanged(caller: Caller, username: string, from: string, to: string): Promise<void> {
    await this.write('account_role_changed', caller, username, { from, to })
  }

  /**
   * **Takes no password and has nowhere to put one.**
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
   * **The fields, not their values.**
   */
  async customerChanged(
    caller: Caller,
    customerId: string,
    detail: { fields: string },
  ): Promise<void> {
    await this.write('customer_changed', caller, customerId, detail)
  }

  /**
   * **The name, for `caseDeleted`'s reason**: afterwards there is no row left to
   * join to, and a line naming a bare uuid answers nothing to somebody reading
   * the log.
   */
  async customerRemoved(
    caller: Caller,
    customerId: string,
    name: string,
  ): Promise<void> {
    await this.write('customer_removed', caller, name, { customerId })
  }

  /**
   * **Held against the survivor, naming the record that went.**
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
   * **The analyst is the subject and the group is a detail.**
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
   * **The title, because `change_feed` cascades with the case.**
   */
  async caseCreated(caller: Caller, caseId: string, title: string): Promise<void> {
    await this.write('case_created', caller, title, { caseId })
  }

  async caseDeleted(caller: Caller, caseId: string, title: string): Promise<void> {
    await this.write('case_deleted', caller, title, { caseId })
  }

  /**
   * **Both customers, because either one alone answers the wrong question.**
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
   */
  async retentionChanged(caller: Caller, from: number, to: number): Promise<void> {
    await this.write('audit_retention_changed', caller, null, {
      from: String(from),
      to: String(to),
    })
  }

  /**
   * One install setting changed, whatever it was.
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
     */
    if (landed && caller.request) (caller.request as Record<symbol, boolean>)[NAMED] = true
  }
}
