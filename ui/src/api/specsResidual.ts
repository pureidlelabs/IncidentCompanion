/**
 * The three things `GET /api/specs` leaves out, and what a client does instead.
 */

/** Writable through the case PATCH, and deliberately without a descriptor. */
export const WRITABLE_WITHOUT_A_SPEC: readonly string[] = ['closedAt']

/** Neither described nor writable through the case PATCH: they need `save_rsit`. */
export const PAIRED_WRITE_ONLY: readonly string[] = ['rsitClass', 'rsitType']
