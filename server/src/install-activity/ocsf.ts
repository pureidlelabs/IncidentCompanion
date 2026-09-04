/**
 * This install's events as OCSF, the schema a security product's log is read in.
 *
 * **OCSF rather than a private vocabulary, and rather than ECS or OTel alone.**
 * This is an MXDR tool: its audit is read by Sentinel, Splunk or a
 * Security Lake, all of which ingest OCSF natively. A private field set would
 * make every one of them a mapping exercise.
 *
 * Three things the framework fixes that were guessed here first:
 *
 * - **`severity_id` is a six-point scale**, `1 Informational, 2 Low, 3 Medium,
 *   4 High, 5 Critical, 6 Fatal` (0 Unknown, 99 Other) - not OTel's
 *   INFO/WARN/ERROR, and not this app's incident ramp.
 * - **`status_id` is `1 Success, 2 Failure`** (0 Unknown, 99 Other).
 * - **An event is a class and an activity, not a name.** `type_uid =
 *   class_uid * 100 + activity_id`, so `300201` is Authentication: Logon.
 *
 * `severity_id`, `activity_id`, `category_uid`, `class_uid`, `type_uid`, `time`
 * and `metadata` are the framework's **required** attributes; `status_id`,
 * `status` and `message` are recommended. Everything here is one of those.
 *
 * -> <https://schema.ocsf.io/1.7.0/classes/base_event>
 */
import type { InstallEvent } from './record.js'

/** OCSF category. 3 is Identity & Access Management, 6 Application Activity. */
export const CATEGORY = { iam: 3, application: 6 } as const

/**
 * The classes this install produces, with the category each sits in.
 *
 * **Only the five it actually emits.** A mapping that names classes nothing
 * writes is a promise to a collector that no data will ever honour.
 */
export const CLASS = {
  /** IAM: an account created, enabled, disabled, or its password reset. */
  accountChange: { uid: 3001, name: 'Account Change', category: CATEGORY.iam },
  /** IAM: a logon, a logoff, or a failed attempt. */
  authentication: { uid: 3002, name: 'Authentication', category: CATEGORY.iam },
  /** IAM: privileges assigned or revoked. */
  userAccess: { uid: 3005, name: 'User Access Management', category: CATEGORY.iam },
  /** Application Activity: the install itself starting. */
  lifecycle: { uid: 6002, name: 'Application Lifecycle', category: CATEGORY.application },
  /** Application Activity: a create, read, update or delete through the API. */
  api: { uid: 6003, name: 'API Activity', category: CATEGORY.application },
} as const

export interface OcsfClassification {
  categoryUid: number
  className: string
  classUid: number
  activityId: number
  activityName: string
  /** `class_uid * 100 + activity_id`, which the framework derives this way. */
  typeUid: number
}

interface Mapping {
  cls: (typeof CLASS)[keyof typeof CLASS]
  activityId: number
  activityName: string
}

/**
 * Every event, mapped once.
 *
 * **Exhaustive by type**, so an event added without a classification is a
 * compile error rather than a row a collector silently files under nothing.
 *
 * The activity ids are the classes' own: Authentication is `1 Logon,
 * 2 Logoff`; Account Change is `1 Create, 2 Enable, 4 Password Reset,
 * 5 Disable`; User Access Management is `1 Assign Privileges`; Application
 * Lifecycle is `3 Start`; API Activity is `1 Create, 2 Read, 3 Update,
 * 4 Delete`.
 */
const MAP: Record<InstallEvent, Mapping> = {
  install_started: { cls: CLASS.lifecycle, activityId: 3, activityName: 'Start' },

  signed_in: { cls: CLASS.authentication, activityId: 1, activityName: 'Logon' },
  signed_out: { cls: CLASS.authentication, activityId: 2, activityName: 'Logoff' },
  // **A failed logon is a Logon with `status_id: 2`**, not an activity of its
  // own. The framework separates *what was attempted* from *how it ended*, and
  // collapsing them is what makes a log unqueryable: "show me every logon"
  // would silently exclude the ones worth looking at.
  sign_in_failed: { cls: CLASS.authentication, activityId: 1, activityName: 'Logon' },

  // A refused request is the API activity that was refused, failing.
  access_denied: { cls: CLASS.api, activityId: 0, activityName: 'Unknown' },
  audit_read: { cls: CLASS.api, activityId: 2, activityName: 'Read' },
  // **`Unknown` on purpose.** The boundary knows a request happened and not
  // what it meant; claiming Create or Update would be the interceptor guessing
  // at semantics only the route has. A typed method names it when it matters.
  api_called: { cls: CLASS.api, activityId: 0, activityName: 'Unknown' },
  evidence_read: { cls: CLASS.api, activityId: 2, activityName: 'Read' },
  data_exported: { cls: CLASS.api, activityId: 2, activityName: 'Read' },
  // Opening a case's live document is an update in waiting: the socket writes
  // the report back, so this is the line that says who could have.
  case_opened_live: { cls: CLASS.api, activityId: 3, activityName: 'Update' },
  // A refused upgrade is an authorisation failure like any other.
  live_refused: { cls: CLASS.authentication, activityId: 1, activityName: 'Logon' },
  audit_retention_changed: { cls: CLASS.api, activityId: 3, activityName: 'Update' },
  // **Delete, not Update.** A prune removes lines; a collector filtering for
  // deletions on this install must find it there.
  audit_pruned: { cls: CLASS.api, activityId: 4, activityName: 'Delete' },

  account_created: { cls: CLASS.accountChange, activityId: 1, activityName: 'Create' },
  account_enabled: { cls: CLASS.accountChange, activityId: 2, activityName: 'Enable' },
  account_disabled: { cls: CLASS.accountChange, activityId: 5, activityName: 'Disable' },
  // **`Lock`, which the framework has.** An account shut by failed
  // sign-ins is not Disable: disable is somebody's decision and lock is
  // the system's, and a reviewer asking which happened needs them apart.
  account_locked: { cls: CLASS.accountChange, activityId: 9, activityName: 'Lock' },
  account_password_reset: {
    cls: CLASS.accountChange,
    activityId: 4,
    activityName: 'Password Reset',
  },
  // **Not Account Change.** A role is a privilege, and the framework has a
  // class for privileges being handed over - which is the one a reviewer
  // searches when asking who was given what.
  account_role_changed: {
    cls: CLASS.userAccess,
    activityId: 1,
    activityName: 'Assign Privileges',
  },

  // **API Activity `Other`.** The framework has no rate-limit class, and
  // the refusal is about the request rather than about a resource - the
  // status carries the refusal, the detail carries which tier.
  rate_limited: { cls: CLASS.api, activityId: 99, activityName: 'Other' },
  // **User Access Management, like a role change and for the same reason.**
  // Reach over a customer's cases is a privilege, and `Assign`/`Revoke
  // Privileges` is what a reviewer searches when asking who was given what.
  customer_created: { cls: CLASS.api, activityId: 1, activityName: 'Create' },
  customer_changed: { cls: CLASS.api, activityId: 3, activityName: 'Update' },
  customer_removed: { cls: CLASS.api, activityId: 4, activityName: 'Delete' },
  // **A merge is a delete of one record**, which is the half a reviewer cares
  // about: the survivor is only updated, and the record that is gone is the
  // one somebody may go looking for.
  customers_merged: { cls: CLASS.api, activityId: 4, activityName: 'Delete' },
  group_created: { cls: CLASS.api, activityId: 1, activityName: 'Create' },
  reach_granted: { cls: CLASS.userAccess, activityId: 1, activityName: 'Assign Privileges' },
  reach_revoked: { cls: CLASS.userAccess, activityId: 2, activityName: 'Revoke Privileges' },

  // **API `Update`, not User Access.** Moving a customer in or out of a group
  // changes who reaches it, but it grants nothing to anybody by name -- the
  // subject is the customer, and a privilege class with no principal in it
  // reads as a grant nobody made.
  group_held_customer: { cls: CLASS.api, activityId: 3, activityName: 'Update' },
  group_released_customer: { cls: CLASS.api, activityId: 3, activityName: 'Update' },
  case_created: { cls: CLASS.api, activityId: 1, activityName: 'Create' },
  case_deleted: { cls: CLASS.api, activityId: 4, activityName: 'Delete' },
  case_attributed: { cls: CLASS.api, activityId: 3, activityName: 'Update' },
  library_kind_replaced: { cls: CLASS.api, activityId: 3, activityName: 'Update' },
  regime_switched: { cls: CLASS.api, activityId: 3, activityName: 'Update' },
  setting_changed: { cls: CLASS.api, activityId: 3, activityName: 'Update' },
  report_language_uploaded: { cls: CLASS.api, activityId: 1, activityName: 'Create' },
  report_language_removed: { cls: CLASS.api, activityId: 4, activityName: 'Delete' },
}

/**
 * The reverse lookups a reader needs, built from `CLASS` rather than repeated.
 *
 * **A stored record carries ids, not names.** A row holds `class_uid` because
 * that is what a collector filters on; the caption is presentation, so it is
 * resolved on the way out from the same table the writer classified with.
 */
export const CATEGORY_OF: Record<number, number> = Object.fromEntries(
  Object.values(CLASS).map((one) => [one.uid, one.category]),
)

export const CLASS_NAME_OF: Record<number, string> = Object.fromEntries(
  Object.values(CLASS).map((one) => [one.uid, one.name]),
)

/**
 * What an activity is called, for a class and id that are already stored.
 *
 * Falls back to `Unknown` rather than throwing: a row written by an older
 * build carries ids this one may not have a caption for, and a reader that
 * refuses to draw such a row hides exactly the history the log exists for.
 */
export function nameOfActivity(classUid: number, activityId: number): string {
  for (const mapping of Object.values(MAP)) {
    if (mapping.cls.uid === classUid && mapping.activityId === activityId) {
      return mapping.activityName
    }
  }
  return 'Unknown'
}

export function classify(event: InstallEvent): OcsfClassification {
  const { cls, activityId, activityName } = MAP[event]
  return {
    categoryUid: cls.category,
    classUid: cls.uid,
    className: cls.name,
    activityId,
    activityName,
    typeUid: cls.uid * 100 + activityId,
  }
}

/**
 * The OCSF schema version this app's records claim to be.
 *
 * **Pinned rather than derived.** `metadata.version` is what a consumer
 * validates against, so it names the version the mapping was written for - a
 * value that drifted with the published schema would assert conformance to a
 * document nobody had checked it against. `ocsf.test.ts` verifies the mapping
 * against exactly this version.
 */
export const OCSF_VERSION = '1.7.0'

/**
 * What this build calls itself.
 *
 * **A constant, not `package.json`'s version**, for the reason
 * `about.controller.ts` gives about the same number: that one means *this npm
 * package*, and the product has cut no release to name. Kept here rather than
 * imported, because `install-activity` may reach `db` and nothing else -
 * an audit that depended on the About screen would be an edge nobody wants.
 */
const BUILD_VERSION = 'internal-dev'

/**
 * `metadata`, a **required** base_event attribute that was emitted as nothing.
 *
 * Of its own attributes only two are required - `version`, the OCSF schema
 * version, and `product`. A strict consumer rejects a record carrying neither,
 * and without `product.version` an audit spanning an upgrade cannot say which
 * build wrote a line. `log_name` is recommended and is free here, because the
 * channel already names the log.
 */
export interface OcsfMetadata {
  version: string
  product: { name: string; vendorName: string; version: string }
  logName: string
}

export function metadataFor(logName: string): OcsfMetadata {
  return {
    version: OCSF_VERSION,
    product: { name: 'IncidentCompanion', vendorName: 'IncidentCompanion', version: BUILD_VERSION },
    logName,
  }
}
