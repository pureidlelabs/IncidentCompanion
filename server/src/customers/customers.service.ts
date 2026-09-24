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
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { eq, inArray, isNull, sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { withReach, type Executor } from '../db/scope.js'
import { customers } from '../db/schema/customer.js'
import { cases } from '../db/schema/case.js'
import { groupCustomers } from '../db/schema/groups.js'
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


  async all(): Promise<{ id: string; name: string; isDefault: boolean }[]> {
    return this.db
      .select({ id: customers.id, name: customers.name, isDefault: customers.isDefault })
      .from(customers)
      .orderBy(customers.name)
  }

  /**
   * Make a customer.
   *
   * **Never the default.** Exactly one default is a partial unique index, so a
   * second would be refused by the database anyway - but taking `isDefault`
   * from a caller at all would make "which record is the default" an editable
   * property, and the specification says it is not.
   */
  async create(
    name: string,
    facts: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    const [made] = await this.db
      .insert(customers)
      .values({ ...facts, name, isDefault: false })
      .returning({ id: customers.id })
    if (!made) throw new Error('the customer could not be created')
    return made
  }

  /**
   * Change a customer's name or any of the organisation's facts.
   *
   * **A rename moves nothing.** The identity is the generated id, which is the
   * whole of the first requirement: renaming an organisation breaks nothing
   * that refers to it, and a case that copied a fact keeps its copy until
   * somebody takes the new one.
   */
  async change(id: string, values: Record<string, unknown>): Promise<void> {
    if (Object.keys(values).length === 0) {
      throw new UnprocessableEntityException({ message: 'A change has to change something.' })
    }
    // **One statement, because a read then a write is a lie in the window
    // between them**: what came back is what says the change happened.
    const changed = await this.db
      .update(customers)
      .set(values)
      .where(eq(customers.id, id))
      .returning({ id: customers.id })
    if (changed.length === 0) throw new NotFoundException({ message: `No customer ${id}.` })
  }

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
  async remove(id: string): Promise<{ name: string }> {
    return withReach(this.db, async (tx) => {
      const [row] = await tx
        .select({ isDefault: customers.isDefault, name: customers.name })
        .from(customers)
        .where(eq(customers.id, id))
      if (!row) throw new NotFoundException({ message: `No customer ${id}.` })
      if (row.isDefault) {
        throw new ConflictException({
          message:
            'The default customer cannot be removed. It is what a case is opened ' +
            'against before anybody knows whose incident it is.',
        })
      }

      // Counted by the store for an administrator, who need reach none of them.
      const { rows: counted } = await tx.execute<{ count: number }>(
        sql`select ic_cases_behind(${id}::uuid) as count`,
      )
      const count = counted[0]?.count ?? 0
      if (count > 0) {
        throw new ConflictException({
          message: `${String(count)} case${count === 1 ? '' : 's'} stand behind this customer. Move them first.`,
        })
      }

      await tx.delete(customers).where(eq(customers.id, id))
      return { name: row.name }
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
  }): Promise<{ losingName: string }> {
    if (losing === surviving) {
      throw new UnprocessableEntityException({ message: 'A customer cannot be merged into itself.' })
    }

    return withReach(this.db, async (tx) => {
      const rows = await tx.select().from(customers).where(inArray(customers.id, [losing, surviving]))
      const from = rows.find((row) => row.id === losing)
      const into = rows.find((row) => row.id === surviving)
      /**
       * **The two halves answer differently because they arrive
       * differently.** `surviving` is named in the path, which is the miss the
       * case guard answers 404 for; `losing` is a body value the analyst can
       * correct, which is what `wire/refusals.ts` reserves 422 for.
       */
      if (!into) throw new NotFoundException({ message: `No customer ${surviving}.` })
      if (!from) {
        throw new UnprocessableEntityException({ message: `No customer ${losing} to merge in.` })
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
       * **A choice names a side; it does not supply a value.** A value neither
       * record holds is refused: the specification says a merge settles which
       * answer survives, not what it becomes.
       *
       * **What is written is the matched record's own value, never the
       * caller's literal.** `sameAnswer` treats `null` and `''` as one answer,
       * so a caller naming the blank side would otherwise write `null` where
       * the record holds `''`, into a column that takes none.
       *
       * The two sides cannot both match: a fact is in `disputed` precisely
       * because they are not the same answer.
       */
      const settled: Record<string, unknown> = {}
      for (const name of disputed) {
        const choice = choices[name]
        if (sameAnswer(choice, held[name])) settled[name] = held[name]
        else if (sameAnswer(choice, kept[name])) settled[name] = kept[name]
        else {
          throw new UnprocessableEntityException({
            message:
              `A merge chooses which answer survives: ${name} must be one of the two ` +
              `the records hold.`,
          })
        }
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
       * **The cases are named by id and the reference they share, never by
       * title.** The administrator merging need reach neither customer, so
       * what a case says is not theirs to read; its id is enough to find it.
       */
      const { rows: shared } = await tx.execute<{
        reference: string
        losing_case: string
        surviving_case: string
      }>(sql`select reference, losing_case, surviving_case from ic_references_shared(${losing}::uuid, ${surviving}::uuid)`)
      if (shared.length > 0) {
        throw new ConflictException({
          message:
            `${shared.map((one) => `${one.reference} is carried by case ${one.losing_case} and case ${one.surviving_case}`).join('; ')}. ` +
            'Change one reference before merging.',
          collisions: shared.map((one) => ({
            reference: one.reference,
            cases: [one.losing_case, one.surviving_case],
          })),
        })
      }

      await tx.execute(sql`select ic_move_cases(${losing}::uuid, ${surviving}::uuid)`)

      /**
       * **A merge moves everything the losing record held, and it held its
       * groups.** Reach is never granted over a customer directly, so a merge
       * that moved only the cases would leave an analyst reaching the survivor
       * at whatever the survivor's own groups gave them and silently losing
       * the rest.
       *
       * `onConflictDoNothing` because the pair is the primary key: a group
       * that already held both sides ends with the one edge it should have,
       * rather than failing the merge on a duplicate.
       *
       * Nothing is granted that neither side gave -- the edges moved are the
       * losing record's own, and what an analyst ends up holding is still the
       * most permissive of their memberships.
       */
      const heldBy = await tx
        .select({ groupId: groupCustomers.groupId })
        .from(groupCustomers)
        .where(eq(groupCustomers.customerId, losing))
      if (heldBy.length > 0) {
        await tx
          .insert(groupCustomers)
          .values(heldBy.map((row) => ({ groupId: row.groupId, customerId: surviving })))
          .onConflictDoNothing()
      }
      await tx.delete(groupCustomers).where(eq(groupCustomers.customerId, losing))
      await tx
        .update(customers)
        .set({
          ...settled,
          updatedBy: actorId,
          updatedAt: new Date(),
          version: sql`${customers.version} + 1`,
        })
        .where(eq(customers.id, surviving))
      await tx.delete(customers).where(eq(customers.id, losing))
      return { losingName: from.name }
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
    return defaultCustomer(this.db)
  }
}

/**
 * Put every case that carries no customer under the default, and answer how
 * many moved.
 *
 * **Idempotent, and it is what makes the reference rule hold on an install
 * that predates it.** A case opened before cases carried a customer has
 * `customer_id IS NULL`, and the application reads that as the default while
 * the unique index keys it separately -- so two cases the product treats as
 * one customer's could both hold one ticket number, which is exactly the state
 * the rule forbids.
 *
 * **A step of the seeding one-shot rather than a migration**, because this
 * schema is pushed rather than migrated and there is no file for a backfill to
 * live in. It writes cases nobody is asking for, which only the seeding role
 * may. -> `seed.ts`
 */
export async function attributeUnattributedCases(on: Executor): Promise<number> {
  const fallback = await defaultCustomer(on)
  const moved = await on
    .update(cases)
    .set({ customerId: fallback.id })
    .where(isNull(cases.customerId))
    .returning({ id: cases.id })
  return moved.length
}

/**
 * The default customer, made if the install has none.
 *
 * Safe to call on every boot: the insert is conditional on the read, and the
 * unique index is what settles a race between two processes doing it at once
 * -- the loser's insert is refused and it reads the winner's row.
 *
 * **Takes the handle rather than reaching for the pool**, because opening a
 * case asks this from inside that case's transaction, and a read reaching the
 * pool from inside an open transaction holds one connection while asking for
 * another. -> `db/scope.ts`
 *
 * **A function rather than a second method**, so the door that opens a case
 * and the hook that runs at boot ask the same question of the same code.
 */
export async function defaultCustomer(on: Executor): Promise<{ id: string; name: string }> {
  const held = { id: customers.id, name: customers.name }

  const [existing] = await on.select(held).from(customers).where(eq(customers.isDefault, true)).limit(1)
  if (existing) return existing

  const [made] = await on
    .insert(customers)
    .values({ name: DEFAULT_CUSTOMER_NAME, isDefault: true })
    .onConflictDoNothing()
    .returning(held)
  if (made) return made

  const [theirs] = await on.select(held).from(customers).where(eq(customers.isDefault, true)).limit(1)
  if (!theirs) throw new Error('the install has no default customer and one could not be made')
  return theirs
}


