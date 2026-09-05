/**
 * The `.iccase` encryption envelope: age (`age-encryption.org/v1`), with this
 * app's rules around it - the passphrase floor, the three error types the
 * routes distinguish, `isSealed`, and the work-factor bound.
 *
 * **`assertWorkFactor` refuses a header above `WORK_FACTOR` before age sees
 * the bytes.** A stored work factor is attacker input, and age derives
 * synchronously, so an unbounded one blocks the event loop rather than a
 * threadpool slot. The rule: an archive this build produced always opens, and
 * one costing more than it ever produces never runs.
 *
 * Takes and returns whole `Buffer`s, so an archive is resident in memory
 * despite age itself being able to stream.
 */
import { Decrypter, Encrypter } from 'age-encryption'

/** Under this, the passphrase is not one. Enforced here, not only on screen. */
export const MIN_PASSPHRASE_CHARS = 12

/**
 * **What this build writes, and therefore the ceiling it will open.** At
 * `2^16` the cost of an import is the cost of an export, and neither is
 * attacker-chosen.
 */
export const WORK_FACTOR = 16

/** age's own header line. `isSealed` reads it; nothing else should. */
const AGE_MAGIC = 'age-encryption.org/v1'

export class WeakPassphrase extends Error {}
export class MalformedEnvelope extends Error {}
export class WrongPassphrase extends Error {}

/**
 * **Refused before age sees the bytes**, because age's own limit permits a
 * factor sixteen times what this app writes and derives synchronously.
 *
 * Reads the `scrypt` stanza's second argument out of the header, which is
 * ASCII up to the first `---` line. A file with no scrypt stanza is not
 * passphrase-encrypted and is rejected by `open` on its own terms.
 */
function assertWorkFactor(sealed: Buffer): void {
  // The header is short and ASCII; 4KB is far past any plausible stanza set and
  // bounds the scan on a hostile file rather than trusting it to be small.
  const header = sealed.subarray(0, 4096).toString('latin1')
  const stanza = /^-> scrypt \S+ (\d+)\s*$/m.exec(header)
  if (stanza === null) return
  if (Number(stanza[1]) > WORK_FACTOR) {
    throw new MalformedEnvelope(
      `This archive asks for more work than this build produces (2^${stanza[1]}).`,
    )
  }
}

/**
 * **Does this look like a sealed archive at all?** The import route branches on
 * it to ask for a passphrase rather than failing an unencrypted file with a
 * decryption error.
 */
export const isSealed = (bytes: Buffer): boolean =>
  bytes.subarray(0, AGE_MAGIC.length).toString('latin1') === AGE_MAGIC

/**
 * **The floor is enforced here and not only on the export screen**, so no
 * caller can seal an archive the app would then describe as encrypted without
 * meaning it.
 */
export async function seal(plain: Buffer, passphrase: string): Promise<Buffer> {
  if (passphrase.length < MIN_PASSPHRASE_CHARS) {
    throw new WeakPassphrase(`A passphrase is at least ${MIN_PASSPHRASE_CHARS} characters.`)
  }
  const encrypter = new Encrypter()
  encrypter.setScryptWorkFactor(WORK_FACTOR)
  encrypter.setPassphrase(passphrase)
  return Buffer.from(await encrypter.encrypt(plain))
}

/**
 * **Every failure is one of two answers and neither says which byte was
 * wrong.** age refuses a tampered file with an authentication failure and a
 * wrong passphrase with no-matching-identity; both are mapped here so a caller
 * cannot learn anything from the difference beyond "wrong key" or "not an
 * archive".
 */
export async function open(sealed: Buffer, passphrase: string): Promise<Buffer> {
  if (!isSealed(sealed)) throw new MalformedEnvelope('This file is not an encrypted archive.')
  assertWorkFactor(sealed)

  const decrypter = new Decrypter()
  decrypter.addPassphrase(passphrase)
  try {
    return Buffer.from(await decrypter.decrypt(sealed))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    // **Only one message means the key was wrong; everything else is a broken
    // file.** Written the other way round first - three "malformed" spellings
    // and a fall-through to `WrongPassphrase` - and measured 2026-08-14 it
    // classified a truncated header and a garbage body as a wrong passphrase.
    // An analyst then retypes a passphrase that was right, and concludes they
    // have lost it, while what they have is a damaged archive.
    //
    // **Failing closed to "broken" is the safe direction** and it is one
    // condition rather than three. Matching a dependency's message text is
    // fragile either way; a new age release adding a spelling degrades this to
    // "this archive is not readable", which is the harmless answer.
    if (message.includes('no identity matched')) {
      throw new WrongPassphrase('That passphrase does not open this archive.')
    }
    throw new MalformedEnvelope('This archive is not readable as one.')
  }
}
