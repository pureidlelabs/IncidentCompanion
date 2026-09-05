/**
 * The customer directory.
 */
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { customers } from '../db/schema/customer.js'
import { cases } from '../db/schema/case.js'
import { groupCustomers } from '../db/schema/groups.js'
import { MERGE_FACTS, sameAnswer } from './organisation-facts.js'

/**
 * What the default is called before anybody renames it.
 */
export const DEFAULT_CUSTOMER_NAME = 'Not yet attributed'

@Injectable()
export class CustomersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}


  /** Every customer this install holds, the default among them. */
  async all(): Promise<{ id: string; name: string; isDefault: boolean }[]> {
    return this.db
      .select({ id: customers.id, name: customers.name, isDefault: customers.isDefault })
      .from(customers)
      .orderBy(customers.name)
  }

  /**
   * Make a customer.
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
   */
  async remove(id: string): Promise<{ name: string }> {
    return this.db.transaction(async (tx) => {
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
      return { name: row.name }
    })
  }

  /**
   * Fold one customer record into another, because the two are one
   * organisation.
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

    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(customers).where(inArray(customers.id, [losing, surviving]))
      const from = rows.find((row) => row.id === losing)
      const into = rows.find((row) => row.id === surviving)
      /**
       * **The two halves answer differently because they arrive differently.**
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
       * **A choice names a side; it does not supply a value.**
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
       * **A boundary at the merge, and nowhere else.**
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

      /**
       * **A merge moves everything the losing record held, and it held its groups.**
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
