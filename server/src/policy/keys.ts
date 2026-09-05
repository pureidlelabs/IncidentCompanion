/**
 * The install's security policy, as settings rather than as constants.
 */
import { z } from 'zod'

/**
 * The lockout, whose values were compiled in until this existed.
 */
export const LOCKOUT_AFTER_FAILURES = 10
export const LOCKOUT_CEILING_FAILURES = 100
export const LOCKOUT_MINUTES = 15
export const LOCKOUT_FLOOR_MINUTES = 5

/**
 * The idle window. **Thirty minutes, and the ceiling is the point.**
 */
export const SESSION_IDLE_MINUTES = 30
export const SESSION_IDLE_FLOOR_MINUTES = 5
export const SESSION_IDLE_CEILING_MINUTES = 12 * 60

/**
 * The absolute lifetime, which the idle window cannot answer for.
 */
export const SESSION_LIFETIME_MINUTES = 8 * 60
export const SESSION_LIFETIME_FLOOR_MINUTES = 30
export const SESSION_LIFETIME_CEILING_MINUTES = 24 * 60

/**
 * **Twelve, and it may be raised but never lowered.**
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
 */
export const POLICY_SETTINGS = {
  'auth.lockoutAfterFailures': bounded(1, LOCKOUT_CEILING_FAILURES, LOCKOUT_AFTER_FAILURES),
  'auth.lockoutMinutes': bounded(LOCKOUT_FLOOR_MINUTES, 24 * 60, LOCKOUT_MINUTES),
  'auth.sessionIdleMinutes': bounded(
    SESSION_IDLE_FLOOR_MINUTES,
    SESSION_IDLE_CEILING_MINUTES,
    SESSION_IDLE_MINUTES,
  ),
  'auth.sessionLifetimeMinutes': bounded(
    SESSION_LIFETIME_FLOOR_MINUTES,
    SESSION_LIFETIME_CEILING_MINUTES,
    SESSION_LIFETIME_MINUTES,
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
