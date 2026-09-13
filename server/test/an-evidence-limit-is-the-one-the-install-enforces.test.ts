/**
 * That the evidence limits an operator sets are the ones the install enforces.
 *
 * **Three settings were registered, bounded, offered and audited, and read by
 * nothing.** Each had a second constant beside it doing the work, in
 * `archive/envelope.ts`, `archive/format.ts` and `evidence/store.ts` -- so an
 * operator moved a limit, the audit recorded that they had moved it, and the
 * limit did not move. -> #588
 *
 * **Driven through the routes.** What was wrong is which code paths consult
 * the stored value, and only a request can say that: every one of those
 * constants was correct in itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness } from './app-harness.js'
import {
  ARCHIVE_MEGABYTES,
  ATTACHMENT_MEGABYTES,
  PASSPHRASE_CHARS,
} from '../src/policy/keys.js'

const RUNNABLE = await bootable()

/** Well inside the bounds, and far from the default, so neither can pass for the other. */
const RAISED_CHARS = 24
const SHORT_PASSPHRASE = 'x'.repeat(PASSPHRASE_CHARS)
const LONG_PASSPHRASE = 'y'.repeat(RAISED_CHARS)
/** Far from the 256MB default, and inside the 1MB..8GB the setting allows. */
const RAISED_MEGABYTES = 3

describe.skipIf(!RUNNABLE)('an evidence limit an operator set', () => {
  let harness: Harness
  let admin: { cookie: string }
  let caseId: string

  async function limitIs(key: string, value: number): Promise<void> {
    const answered = await fetch(`${harness.base}/api/install/policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ key, value }),
    })
    if (!answered.ok) {
      throw new Error(`setting ${key} to ${String(value)} answered ${String(answered.status)}`)
    }
  }

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const made = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ title: 'Evidence limits' }),
    })
    if (!made.ok) throw new Error(`making this file's case answered ${String(made.status)}`)
    caseId = ((await made.json()) as { id: string }).id
  }, 90_000)

  afterAll(async () => {
    // **Restored, because the settings are the install's and the database is
    // shared.** A file that leaves a limit moved fails the next one in a way
    // that reads as that file's defect.
    await limitIs('evidence.passphraseChars', PASSPHRASE_CHARS).catch((why: unknown) => {
      process.stdout.write(`  ! the passphrase minimum was not restored: ${String(why)}\n`)
    })
    await limitIs('evidence.attachmentMegabytes', ATTACHMENT_MEGABYTES).catch((why: unknown) => {
      process.stdout.write(`  ! the attachment ceiling was not restored: ${String(why)}\n`)
    })
    await limitIs('evidence.archiveMegabytes', ARCHIVE_MEGABYTES).catch((why: unknown) => {
      process.stdout.write(`  ! the archive ceiling was not restored: ${String(why)}\n`)
    })
    await harness.close()
  })

  async function archiveWith(passphrase: string): Promise<Response> {
    return fetch(`${harness.base}/api/cases/${caseId}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ passphrase, includeFiles: false }),
    })
  }

  it('refuses a passphrase under the minimum the operator raised it to', async () => {
    await limitIs('evidence.passphraseChars', RAISED_CHARS)
    try {
      const answered = await archiveWith(SHORT_PASSPHRASE)

      expect(
        answered.status,
        'a passphrase the install refuses was accepted by the archive route',
      ).toBe(422)
    } finally {
      await limitIs('evidence.passphraseChars', PASSPHRASE_CHARS)
    }
  })

  /**
   * **A control, and only that.** It says the route does not refuse
   * everything; it cannot show the bound moved, because a passphrase long
   * enough for the raised minimum is long enough for the old constant too.
   * The case below is the one that bites in this direction.
   */
  it('takes a passphrase that meets the raised minimum', async () => {
    await limitIs('evidence.passphraseChars', RAISED_CHARS)
    try {
      const answered = await archiveWith(LONG_PASSPHRASE)

      expect(answered.ok, 'a passphrase meeting the raised minimum was refused').toBe(true)
    } finally {
      await limitIs('evidence.passphraseChars', PASSPHRASE_CHARS)
    }
  })

  /**
   * **Lowered, which the old constant cannot express.** Nine characters is
   * under the compile-time twelve and over a minimum an operator set to eight,
   * so this is refused by the constant and accepted by the setting -- the one
   * shape that tells the two apart in this direction.
   */
  it('takes a passphrase the install lowered its minimum to accept', async () => {
    await limitIs('evidence.passphraseChars', 8)
    try {
      const answered = await archiveWith('x'.repeat(9))

      expect(
        answered.ok,
        'a passphrase the install accepts was refused against the compile-time minimum',
      ).toBe(true)
    } finally {
      await limitIs('evidence.passphraseChars', PASSPHRASE_CHARS)
    }
  })


  /**
   * **The Health pane states the limit an operator is held to**, so a screen
   * that reports the compile-time constant tells them the wrong number -- and
   * agrees with the code while both disagree with the setting.
   */
  it('reports every raised limit on the settings screen', async () => {
    await limitIs('evidence.passphraseChars', RAISED_CHARS)
    await limitIs('evidence.attachmentMegabytes', RAISED_MEGABYTES)
    await limitIs('evidence.archiveMegabytes', RAISED_MEGABYTES)
    try {
      const answered = await fetch(`${harness.base}/api/settings`, {
        headers: { cookie: admin.cookie },
      })
      const body = (await answered.json()) as {
        limits?: { passphraseChars?: number; attachmentBytes?: number; archiveBytes?: number }
      }

      expect(
        body.limits?.passphraseChars,
        'the settings screen reports a passphrase minimum nothing enforces',
      ).toBe(RAISED_CHARS)
      expect(
        body.limits?.attachmentBytes,
        'the settings screen reports an attachment ceiling nothing enforces',
      ).toBe(RAISED_MEGABYTES * 1024 * 1024)
      expect(
        body.limits?.archiveBytes,
        'the settings screen reports an archive ceiling nothing enforces',
      ).toBe(RAISED_MEGABYTES * 1024 * 1024)
    } finally {
      await limitIs('evidence.passphraseChars', PASSPHRASE_CHARS)
      await limitIs('evidence.attachmentMegabytes', ATTACHMENT_MEGABYTES)
      await limitIs('evidence.archiveMegabytes', ARCHIVE_MEGABYTES)
    }
  }, 30_000)
})
