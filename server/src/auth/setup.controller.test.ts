/**
 * **The promotion is scoped to the account the claim just created.**
 *
 * A bare `UPDATE user SET role = 'admin'` is correct while the install has no
 * accounts, and a privilege escalation the instant that premise is false: two
 * callers racing the unclaimed check both pass it, and the second's unscoped
 * update hands its own new account the first one's install.
 *
 * The db is a stub because what is asserted is the *shape of the statement*,
 * which a real Postgres would answer identically either way: with one account
 * on the install, a scoped and an unscoped update touch the same single row.
 */
import { describe, expect, it } from 'vitest'

import { ADMIN_ROLE } from '../domain/analyst-account.js'
import { SetupController, type ClaimDto } from './setup.controller.js'
import { mintToken } from './setup.token.js'

const recordingDb = (claimIsFree = true) => {
  const updates: { set: unknown; where: unknown }[] = []
  const deletes: unknown[] = []
  /** Whether this stub has already handed the install to somebody. */
  let free = claimIsFree

  const handle = {
    select: () => ({ from: async () => [{ how: 0 }] }),
    /**
     * **Hands the install over once**, which is what the controller asks the
     * database to decide. A stub answering every caller a row would assert the
     * race rather than the fix.
     */
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (!free) return []
            free = false
            return [{ what: 'install' }]
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => {
        const call = { set: values, where: undefined as unknown }
        updates.push(call)
        // Awaiting an unscoped update is what the defect looked like, so the
        // `set` result has to be thenable on its own.
        return Object.assign(Promise.resolve(), {
          where: (clause: unknown) => {
            call.where = clause
            return Promise.resolve()
          },
        })
      },
    }),
    delete: () => ({
      where: (clause: unknown) => {
        deletes.push(clause)
        return Promise.resolve()
      },
    }),
  }

  // The promote runs inside a transaction, and the stub hands the same handle
  // to it -- so what the transaction does is recorded here like anything else.
  const db = { ...handle, transaction: async (work: (tx: unknown) => Promise<unknown>) => work(handle) }
  return { db, updates, deletes }
}

const signsUpFine = {
  api: {
    signUpEmail: async () => new Response('{}', { status: 200, headers: {} }),
    signInEmail: async () => new Response('{}', { status: 200, headers: {} }),
  },
}

const claim = (token: string): ClaimDto =>
  ({
    token,
    username: 'first@example.invalid',
    password: 'a-password-long-enough',
    repeat: 'a-password-long-enough',
  })

const response = { setHeader: () => undefined } as never

describe('claiming an unclaimed install', () => {
  it('promotes with a where clause rather than every row', async () => {
    const { db, updates } = recordingDb()
    const controller = new SetupController(db as never, signsUpFine as never)
    await controller.mintIfUnclaimed()

    // The token is private and minted at boot; mint one and plant it, since
    // what is under test is the promotion rather than the token check.
    const token = mintToken()
    ;(controller as unknown as { token: string }).token = token

    await controller.claim(claim(token), response)

    expect(updates).toHaveLength(1)
    expect(updates[0]?.set).toEqual({ role: ADMIN_ROLE })
    expect(updates[0]?.where, 'an unscoped promotion makes every account an admin').toBeDefined()
  })

  /**
   * **The controller asks the database before it promotes anybody.**
   *
   * Asserted here because the shipping path had nothing on it: the mutex could
   * be deleted from `claim()` and every test stayed green -- the integration
   * files only ever POST to an already-claimed install, refused at the account
   * count before they reach it. -> #600
   */
  it('promotes nobody when another claim took the install first', async () => {
    const { db, updates } = recordingDb(false)
    const controller = new SetupController(db as never, signsUpFine as never)
    await controller.mintIfUnclaimed()
    const token = mintToken()
    ;(controller as unknown as { token: string }).token = token

    await expect(
      controller.claim(claim(token), response),
      'a caller that lost the claim was not refused',
    ).rejects.toMatchObject({ status: 403 })

    expect(updates, 'a losing caller promoted an administrator').toEqual([])
  })

  /**
   * **The losing caller's account is taken back.** It was created a moment ago
   * by this request and nothing else has touched it, and the requirement's own
   * words are that an install must not let somebody create their own account.
   */
  it('takes back the account a losing claim created', async () => {
    const { db, deletes } = recordingDb(false)
    const controller = new SetupController(db as never, signsUpFine as never)
    await controller.mintIfUnclaimed()
    const token = mintToken()
    ;(controller as unknown as { token: string }).token = token

    await expect(controller.claim(claim(token), response)).rejects.toMatchObject({ status: 403 })

    expect(deletes, 'a fresh install is left holding an account nobody asked for').toHaveLength(1)
  })

  /**
   * **The refusal says what is true.** Reusing *this install already has an
   * account* describes a state where none exists, and `GET /api/setup` answers
   * `{unclaimed: true}` at the same moment -- so the losing operator is told
   * the install is claimed while the first-run screen offers to claim it.
   */
  it('says an administrator exists, not an account', async () => {
    const { db } = recordingDb(false)
    const controller = new SetupController(db as never, signsUpFine as never)
    await controller.mintIfUnclaimed()
    const token = mintToken()
    ;(controller as unknown as { token: string }).token = token

    await expect(controller.claim(claim(token), response)).rejects.toThrow(/administrator/)
  })
})
