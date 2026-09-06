/**
 * The three things `GET /api/specs` leaves out, and what a client does instead.
 *
 * This file exists so the *reason* for the gaps is written down. Each is
 * excluded because serialising it would produce a second answer rather than
 * the same one:
 *
 * - **The kill chain phase** is a derivation over tactic *and* technique, not
 *   a table. Half a copy of it answers differently from the app, so a client
 *   wanting an entry's phase writes the entry and reads it back. `ukcOverride`
 *   *is* published -- it is a stored field with a vocabulary, and the override
 *   is the only half a form can set.
 * - **`closedAt`** is stamped on close and cleared otherwise, so an editor for
 *   it is gated on `status === 'closed'`. A spec row has no slot for "gated by
 *   another field's value".
 * - **`rsitClass` / `rsitType`** validate as a pair and go in one write;
 *   changing the class alone leaves a combination the validator refuses, and a
 *   one-field-at-a-time PATCH drops half of it. So they get their own route or
 *   nothing.
 *
 * **Only `closedAt` reaches `specs.case.writable`.** The rsit pair is in
 * neither list, so `PATCH /api/cases/{id}` has nothing to offer it at all.
 *
 * `OverviewForm` renders `case.fields` and therefore offers no control for any
 * of the three; `specs.test.ts` pins that against these lists.
 */

/** Writable through the case PATCH, and deliberately without a descriptor. */
export const WRITABLE_WITHOUT_A_SPEC: readonly string[] = ['closedAt']

/** Neither described nor writable through the case PATCH: they need `save_rsit`. */
export const PAIRED_WRITE_ONLY: readonly string[] = ['rsitClass', 'rsitType']
