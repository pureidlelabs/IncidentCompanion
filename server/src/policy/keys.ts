/**
 * The install's security policy, as settings rather than as constants.
 *
 * **A folder of its own, because of who needs to read it.** The settings route
 * writes these and lives in `preferences`; the controls they bound live in
 * `auth`. `preferences` already imports `auth`, so declaring them there would
 * make `auth -> preferences` a folder cycle - which is the shape
 * `architecture.test.ts` refuses and the shape that reads as a missing
 * provider at runtime. This folder imports `db` and `config` and nothing else,
 * so both sides can reach it.
 *
 * **One declaration per setting, not two.** The registry in
 * `preferences/install.service.ts` spreads these in rather than restating
 * them, so a floor cannot be enforced at the route and forgotten at the
 * control.
 *
 * **Every floor and ceiling here is a bound on a bound.** A setting that can
 * be set to anything is a control that can be switched off from a screen while
 * the screen still shows it working - which is worse than not offering the
 * setting, because the install believes it is protected.
 */
import { z } from 'zod'

/**
 * The lockout, whose values were compiled in until this existed.
 *
 * **Ten and fifteen minutes is Better Auth's own default** for the lockout it
 * ships for two-factor. The ceiling on the threshold is what stops the control
 * being turned off by setting it to a thousand; the floor on the duration is
 * what stops it being over before an attacker notices.
 */
export const LOCKOUT_AFTER_FAILURES = 10
export const LOCKOUT_CEILING_FAILURES = 100
export const LOCKOUT_MINUTES = 15
export const LOCKOUT_FLOOR_MINUTES = 5

/**
 * The idle window. **Thirty minutes, and the ceiling is the point.**
 *
 * A SOC on a shared terminal wants minutes; one on managed laptops wants a
 * shift. A day is not a session policy, it is the absence of one.
 */
export const SESSION_IDLE_MINUTES = 30
export const SESSION_IDLE_FLOOR_MINUTES = 5
export const SESSION_IDLE_CEILING_MINUTES = 12 * 60

/**
 * **Twelve, and it may be raised but never lowered.** The floor is this app's;
 * a customer's own standard may be stricter, and the setting exists for that
 * direction.
 */
export const MIN_PASSWORD_LENGTH = 12
export const PASSWORD_FLOOR = 12
export const PASSWORD_CEILING = 128

/** The run-collapse window the audit reader groups by. */
export const RUN_WINDOW_MINUTES = 5
export const RUN_WINDOW_FLOOR_MINUTES = 1
export const RUN_WINDOW_CEILING_MINUTES = 60

/** Evidence ceilings, in megabytes because that is what a screen states. */
export const ATTACHMENT_MEGABYTES = 256
export const ARCHIVE_MEGABYTES = 512
export const EVIDENCE_FLOOR_MEGABYTES = 1
export const EVIDENCE_CEILING_MEGABYTES = 8 * 1024

export const PASSPHRASE_CHARS = 12
export const PASSPHRASE_FLOOR = 8
export const PASSPHRASE_CEILING = 256

const bounded = (floor: number, ceiling: number, fallback: number) => ({
  schema: z.number().int().min(floor).max(ceiling),
  fallback,
  floor,
  ceiling,
})

/**
 * Every policy setting, its shape, its default and the bounds a screen states.
 *
 * `floor` and `ceiling` travel with the schema so a route can serve them and a
 * screen need not hard-code what the server will refuse.
 */
export const POLICY_SETTINGS = {
  'auth.lockoutAfterFailures': bounded(1, LOCKOUT_CEILING_FAILURES, LOCKOUT_AFTER_FAILURES),
  'auth.lockoutMinutes': bounded(LOCKOUT_FLOOR_MINUTES, 24 * 60, LOCKOUT_MINUTES),
  'auth.sessionIdleMinutes': bounded(
    SESSION_IDLE_FLOOR_MINUTES,
    SESSION_IDLE_CEILING_MINUTES,
    SESSION_IDLE_MINUTES,
  ),
  'auth.minPasswordLength': bounded(PASSWORD_FLOOR, PASSWORD_CEILING, MIN_PASSWORD_LENGTH),
  'audit.runWindowMinutes': bounded(
    RUN_WINDOW_FLOOR_MINUTES,
    RUN_WINDOW_CEILING_MINUTES,
    RUN_WINDOW_MINUTES,
  ),
  'evidence.attachmentMegabytes': bounded(
    EVIDENCE_FLOOR_MEGABYTES,
    EVIDENCE_CEILING_MEGABYTES,
    ATTACHMENT_MEGABYTES,
  ),
  'evidence.archiveMegabytes': bounded(
    EVIDENCE_FLOOR_MEGABYTES,
    EVIDENCE_CEILING_MEGABYTES,
    ARCHIVE_MEGABYTES,
  ),
  'evidence.passphraseChars': bounded(PASSPHRASE_FLOOR, PASSPHRASE_CEILING, PASSPHRASE_CHARS),
} as const

export type PolicyKey = keyof typeof POLICY_SETTINGS
