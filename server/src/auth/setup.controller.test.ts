/**
 * **The promotion is scoped to the account the claim just created.**
 *
 * A bare `UPDATE user SET role = 'admin'` is correct while the install has no
 * accounts, and a privilege escalation the instant that premise is false: two
 * callers racing the unclaimed check both pass it, and the second's unscoped
 * update hands its own new account the first one's install.
 *
 * **Held here rather than in `claiming-an-install.test.ts`, and the reason is
 * that the integration tier cannot reach this line.** That tier runs against a
 * database the suite has already put accounts in, so every claim is refused
 * before the promotion. A test written there passed with the `where` deleted -
 * a green break-verify, and the whole of its information.
 *
 * The db is a stub because what is asserted is the *shape of the statement*,
 * which a real Postgres would answer identically either way: with one account
 * on the install, a scoped and an unscoped update touch the same single row.
 */
import { describe, expect, it } from 'vitest'

import { ADMIN_ROLE } from './auth.config.js'
import { SetupController, type ClaimDto } from './setup.controller.js'
import { mintToken } from './setup.token.js'

/** Records what `update(...).set(...).where(...)` was handed, if anything. */
const recordingDb = () => {
  const updates: { set: unknown; where: unknown }[] = []
  const db = {
    select: () => ({ from: async () => [{ how: 0 }] }),
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
  }
  return { db, updates }
}

const signsUpFine = {
  api: {
    signUpEmail: async () => new Response('{}', { status: 200, headers: {} }),
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
})
