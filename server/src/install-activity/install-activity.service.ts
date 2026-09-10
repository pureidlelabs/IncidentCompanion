/**
 * The audit's facade: one named method per thing this install can have done,
 * each taking what its event needs and building the attributes itself.
 *
 * The actor is always a session, never a name.
 */
import { Inject, Injectable } from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { NAMED } from './named.js'
import { recordInstallActivity, type InstallActivityInput } from './record.js'

/** What a caller hands over: their own session and their own request. */
export interface Caller {
  session: { user: { id: string; name?: string | null; email?: string | null } }
  headers: IncomingHttpHeaders
  /**
   * The request itself, so a named act can mark it accounted for and
   * `AuditInterceptor` stays quiet. Absent where there is no request: the boot
   * line and Better Auth's hooks.
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
   * The unnamed door, for the boundary interceptor alone: it records a request
   * to a route it knows nothing about. A route names what it did through the
   * methods below.
   */
  async record(input: InstallActivityInput): Promise<void> {
    await recordInstallActivity(this.db, input)
  }

  async accountCreated(caller: Caller, username: string, role: string): Promise<void> {
    await this.write('account_created', caller, username, { role })
  }

  async accountDisabled(caller: Caller, username: string): Promise<void> {
    await this.write('account_disabled', caller, username)
  }

  async accountEnabled(caller: Caller, username: string): Promise<void> {
    await this.write('account_enabled', caller, username)
  }

  /** `from` is read before the write, because afterwards nothing holds it. */
  async roleChanged(caller: Caller, username: string, from: string, to: string): Promise<void> {
    await this.write('account_role_changed', caller, username, { from, to })
  }

  async passwordReset(caller: Caller, username: string): Promise<void> {
    await this.write('account_password_reset', caller, username)
  }

  async customerCreated(
    caller: Caller,
    customerId: string,
    detail: { name: string },
  ): Promise<void> {
    await this.write('customer_created', caller, customerId, detail)
  }

  /** `fields` names what changed, never the values. */
  async customerChanged(
    caller: Caller,
    customerId: string,
    detail: { fields: string },
  ): Promise<void> {
    await this.write('customer_changed', caller, customerId, detail)
  }

  /** Held against the name, which outlives the row. */
  async customerRemoved(caller: Caller, customerId: string, name: string): Promise<void> {
    await this.write('customer_removed', caller, name, { customerId })
  }

  /** Held against the survivor, naming the record that went. */
  async customersMerged(
    caller: Caller,
    surviving: string,
    detail: { losing: string; losingName: string },
  ): Promise<void> {
    await this.write('customers_merged', caller, surviving, detail)
  }

  async groupCreated(caller: Caller, groupId: string, detail: { name: string }): Promise<void> {
    await this.write('group_created', caller, groupId, detail)
  }

  /** The analyst is the subject; the group is how. */
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

  /** The customer is the subject: nobody was granted anything by name. */
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

  /** Held against the title, which outlives the case's own activity. */
  async caseCreated(caller: Caller, caseId: string, title: string): Promise<void> {
    await this.write('case_created', caller, title, { caseId })
  }

  async caseDeleted(caller: Caller, caseId: string, title: string): Promise<void> {
    await this.write('case_deleted', caller, title, { caseId })
  }

  /** Both customers; a case that named nobody says `none` rather than omitting the key. */
  async caseAttributed(
    caller: Caller,
    caseId: string,
    title: string,
    detail: { from: string | null; to: string },
  ): Promise<void> {
    await this.write('case_attributed', caller, title, {
      caseId,
      from: detail.from ?? 'none',
      to: detail.to,
    })
  }

  async regimeSwitched(caller: Caller, regime: string, enabled: boolean): Promise<void> {
    await this.write('regime_switched', caller, regime, { enabled: String(enabled) })
  }

  /** `ignored` counts the pack's lines that were not stored. */
  async languageUploaded(
    caller: Caller,
    code: string,
    label: string,
    ignored: number,
  ): Promise<void> {
    await this.write('report_language_uploaded', caller, code, {
      label,
      ignored: String(ignored),
    })
  }

  async languageRemoved(caller: Caller, code: string): Promise<void> {
    await this.write('report_language_removed', caller, code)
  }

  /** The route replaces a kind wholesale and keeps no document, so the counts are the record. */
  async libraryKindReplaced(
    caller: Caller,
    slug: string,
    entries: number,
    disabledBuiltins: number,
  ): Promise<void> {
    await this.write('library_kind_replaced', caller, slug, {
      entries: String(entries),
      disabledBuiltins: String(disabledBuiltins),
    })
  }

  async retentionChanged(caller: Caller, from: number, to: number): Promise<void> {
    await this.write('audit_retention_changed', caller, null, {
      from: String(from),
      to: String(to),
    })
  }

  /** One event for every install setting; the key discriminates, and the level is derived from key and direction. */
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

    // Marked only after a line landed: a failed write is swallowed by design,
    // and a mark without a line would silence the boundary's vaguer one too.
    if (landed && caller.request) (caller.request as Record<symbol, boolean>)[NAMED] = true
  }
}
