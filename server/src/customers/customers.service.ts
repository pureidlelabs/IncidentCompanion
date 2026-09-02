/**
 * The customer directory.
 *
 * **The install always holds a default customer**, standing for an incident
 * whose origin is not yet known, so a case can be opened before anybody has
 * been onboarded. `openspec/specs/customers/spec.md` requires it to exist, to
 * be undeletable, and not to be editable into an ordinary customer.
 *
 * Exactly one is enforced by a partial unique index rather than here: a check
 * in this file is one forgotten call site away from an install with two, and
 * half the code would then disagree about which was the default.
 */
import { ConflictException, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { customers } from '../db/schema/customer.js'
import { cases } from '../db/schema/case.js'
import { MERGE_FACTS, sameAnswer } from './organisation-facts.js'

/**
 * What the default is called before anybody renames it.
 *
 * **The name is not the identity.** A rename leaves it the default, because
 * what marks it is the flag rather than this string -- which is the point of
 * the first requirement: renaming an organisation breaks nothing that refers
 * to it.
 */
export const DEFAULT_CUSTOMER_NAME = 'Not yet attributed'

@Injectable()
export class CustomersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}


  /**
   * Remove a customer, refusing while cases stand behind it.
   *
   * **The count is in the refusal**, because *this customer has cases* leaves
   * an administrator no way to judge whether to go and move them: three is an
   * afternoon and three hundred is a different decision.
   *
   * The database refuses this too - the foreign key is `restrict` - and that
   * is the guarantee. This is the sentence a person reads, and it is checked
   * inside the same transaction as the delete so the count cannot be stale by
   * the time it is acted on.
   */
  async remove(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ isDefault: customers.isDefault })
        .from(customers)
        .where(eq(customers.id, id))
      if (!row) throw new UnprocessableEntityException({ message: `No customer ${id}.` })
      if (row.isDefault) {
        throw new ConflictException({
          message:
            'The default customer cannot be removed. It is what a case is opened ' +
            'against before anybody knows whose incident it is.',
        })
      }

      const [counted] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cases)
        .where(eq(cases.customerId, id))
      const count = counted?.count ?? 0
      if (count > 0) {
        throw new ConflictException({
          message: `${String(count)} case${count === 1 ? '' : 's'} stand behind this customer. Move them first.`,
        })
      }

      await tx.delete(customers).where(eq(customers.id, id))
    })
  }

  /**
   * Fold one customer record into another, because the two are one
   * organisation.
   *
   * **A merge rather than moving cases one at a time**, which is what the
   * specification asks for and why: duplicates are how customer records
   * actually go wrong, and moving them by hand invites the analyst to miss
   * some.
   *
   * **Every disagreement is answered by the caller or the merge is refused.**
   * Keeping the survivor's answer where the two differ would be the system
   * choosing, which the specification forbids in as many words. A choice for a
   * fact they agree on is refused too: that is an edit wearing a merge's
   * clothes, and it would change an answer neither record held with the
   * merge's attribution on it.
   *
   * **What a case already copied is untouched.** The copy lives on the case,
   * and nothing here writes to one - which is what stops a report written
   * months ago changing because two records were tidied up today.
   */
  async merge({
    losing,
    surviving,
    choices,
    actorId,
  }: {
    losing: string
    surviving: string
    choices: Record<string, unknown>
    actorId: string
  }): Promise<void> {
    if (losing === surviving) {
      throw new UnprocessableEntityException({ message: 'A customer cannot be merged into itself.' })
    }

    await this.db.transaction(async (tx) => {
      const rows = await tx.select().from(customers).where(inArray(customers.id, [losing, surviving]))
      const from = rows.find((row) => row.id === losing)
      const into = rows.find((row) => row.id === surviving)
      if (!from || !into) {
        throw new UnprocessableEntityException({ message: 'Both customers must exist to merge.' })
      }
      if (from.isDefault || into.isDefault) {
        throw new ConflictException({
          message:
            'The default customer cannot be merged, in either direction. It stands for ' +
            'an incident whose origin is not yet known, which is not an organisation.',
        })
      }

      const held = from as unknown as Record<string, unknown>
      const kept = into as unknown as Record<string, unknown>
      // **`MERGE_FACTS`, not the copy set.** What a case copies excludes
      // `regimes` on purpose; what two records can disagree about does not.
      const disputed = MERGE_FACTS.filter((name) => !sameAnswer(held[name], kept[name]))

      const unanswered = disputed.filter((name) => !(name in choices))
      if (unanswered.length > 0) {
        throw new ConflictException({
          message:
            `These two answer differently and the merge cannot choose for you: ` +
            `${unanswered.join(', ')}.`,
        })
      }
      const spurious = Object.keys(choices).filter((name) => !disputed.includes(name))
      if (spurious.length > 0) {
        throw new UnprocessableEntityException({
          message:
            `A merge settles a disagreement, it does not edit: ` +
            `${spurious.join(', ')} ${spurious.length === 1 ? 'is' : 'are'} not in dispute.`,
        })
      }

      /**
       * **A boundary at the merge, and nowhere else.** This refuses to
       * *create* two cases carrying one reference under a single customer.
       * Nothing forbids that state existing and no uniqueness is enforced on
       * the reference anywhere: it is the customer's own ITSM ticket,
       * deliberately not unique, and two organisations legitimately share a
       * ticket number. Enforcing it as an invariant would refuse states the
       * rest of the system permits - including the ordinary one, where every
       * unattributed case sits under the default customer.
       * -> `openspec/specs/customers/design.md`
       *
       * **The cases are named, not the references.** The scenario asks that
       * the analyst be told *which two cases collide*, and a reference alone
       * leaves them to go and find both.
       */
      const mine = await tx
        .select({ id: cases.id, title: cases.title, reference: cases.reference })
        .from(cases)
        .where(and(eq(cases.customerId, losing), ne(cases.reference, '')))
      const theirs = await tx
        .select({ id: cases.id, title: cases.title, reference: cases.reference })
        .from(cases)
        .where(and(eq(cases.customerId, surviving), ne(cases.reference, '')))

      const byReference = new Map(theirs.map((row) => [row.reference, row]))
      const clashing = mine.flatMap((one) => {
        const other = one.reference === null ? undefined : byReference.get(one.reference)
        return other ? [`"${one.title}" and "${other.title}" both carry ${one.reference ?? ''}`] : []
      })
      if (clashing.length > 0) {
        throw new ConflictException({
          message: `${clashing.join('; ')}. Change one reference before merging.`,
        })
      }

      await tx.update(cases).set({ customerId: surviving }).where(eq(cases.customerId, losing))
      await tx
        .update(customers)
        .set({
          ...choices,
          updatedBy: actorId,
          updatedAt: new Date(),
          version: sql`${customers.version} + 1`,
        })
        .where(eq(customers.id, surviving))
      await tx.delete(customers).where(eq(customers.id, losing))
    })
  }

  /**
   * The default customer, made if the install has none.
   *
   * Safe to call on every boot: the insert is conditional on the read, and the
   * unique index is what settles a race between two processes doing it at
   * once -- the loser's insert is refused and it reads the winner's row.
   */
  async ensureDefault(): Promise<{ id: string; name: string }> {
    const [existing] = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)
    if (existing) return existing

    const [made] = await this.db
      .insert(customers)
      .values({ name: DEFAULT_CUSTOMER_NAME, isDefault: true })
      .onConflictDoNothing()
      .returning({ id: customers.id, name: customers.name })
    if (made) return made

    // Somebody else won the race between the read and the insert.
    const [theirs] = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)
    if (!theirs) throw new Error('the install has no default customer and one could not be made')
    return theirs
  }
}
