/**
 * The `.iccase` encryption envelope, now age.
 */
import { describe, expect, it } from 'vitest'

import {
  MIN_PASSPHRASE_CHARS,
  MalformedEnvelope,
  WORK_FACTOR,
  WeakPassphrase,
  WrongPassphrase,
  isSealed,
  open,
  seal,
} from './envelope.js'

const PASS = 'a-long-enough-passphrase'
const PLAIN = Buffer.from('the case archive, in the clear')

/** Re-stamp a sealed archive with the work factor an attacker would send. */
async function withWorkFactor(logN: number): Promise<Buffer> {
  const sealed = await seal(PLAIN, PASS)
  const text = sealed.toString('latin1')
  const restamped = text.replace(/^(-> scrypt \S+) \d+$/m, `$1 ${String(logN)}`)
  // Asserted on the *result*, not on the change: re-stamping the value already
  // there is a no-op, so "it differs" would fail for the legitimate case while
  // a regex that matched nothing would slip through for every other one.
  expect(restamped).toMatch(new RegExp(`^-> scrypt \\S+ ${String(logN)}$`, 'm'))
  return Buffer.from(restamped, 'latin1')
}

describe('sealing', () => {
  it('refuses a passphrase too short to be one', async () => {
    // Enforced here and not only on the export screen, so no caller can seal
    // an archive the app would then describe as encrypted without meaning it.
    await expect(seal(PLAIN, 'short')).rejects.toBeInstanceOf(WeakPassphrase)
    await expect(seal(PLAIN, '')).rejects.toBeInstanceOf(WeakPassphrase)
    await expect(seal(PLAIN, 'x'.repeat(MIN_PASSPHRASE_CHARS))).resolves.toBeInstanceOf(Buffer)
  })

  it('never puts the plaintext in the output', async () => {
    const sealed = await seal(PLAIN, PASS)
    expect(sealed.includes(PLAIN)).toBe(false)
  })

  it('produces a different archive every time from the same input', async () => {
    // A fresh scrypt salt per seal. Identical output would mean it is fixed,
    // and a fixed salt under a fixed passphrase is a fixed key.
    const a = await seal(PLAIN, PASS)
    const b = await seal(PLAIN, PASS)
    expect(a.equals(b)).toBe(false)
  })

  it('writes the work factor this build bounds, rather than the ceiling age allows', async () => {
    // The bound below is only worth anything if what we write sits under it.
    // age permits up to 2^20 and derives synchronously; this app writes 2^16.
    const sealed = await seal(PLAIN, PASS)
    expect(sealed.toString('latin1')).toMatch(
      new RegExp(`^-> scrypt \\S+ ${String(WORK_FACTOR)}$`, 'm'),
    )
  })

  it('is recognisable as an archive rather than a plain zip', async () => {
    expect(isSealed(await seal(PLAIN, PASS))).toBe(true)
    expect(isSealed(Buffer.from('PK a plain zip'))).toBe(false)
  })
})

describe('opening', () => {
  it('returns exactly what was sealed', async () => {
    expect((await open(await seal(PLAIN, PASS), PASS)).equals(PLAIN)).toBe(true)
  })

  it('carries an empty archive', async () => {
    expect((await open(await seal(Buffer.alloc(0), PASS), PASS)).length).toBe(0)
  })

  it('carries an archive larger than one stream chunk', async () => {
    // age's STREAM splits at 64KB, so this is where a chunk index or the final
    // marker being wrong would stop being invisible.
    const big = Buffer.alloc(1024 * 1024 + 1234, 0x7a)
    expect((await open(await seal(big, PASS), PASS)).equals(big)).toBe(true)
  })

  it('refuses the wrong passphrase', async () => {
    const sealed = await seal(PLAIN, PASS)
    await expect(open(sealed, 'a-different-passphrase')).rejects.toBeInstanceOf(WrongPassphrase)
  })

  it('refuses a flipped bit in the ciphertext', async () => {
    const sealed = await seal(PLAIN, PASS)
    const tampered = Buffer.from(sealed)
    tampered[tampered.length - 8]! ^= 0x01
    await expect(open(tampered, PASS)).rejects.toThrow()
  })

  it('refuses an edit to the scrypt salt, which changes the key', async () => {
    const sealed = await seal(PLAIN, PASS)
    const text = sealed.toString('latin1')
    const edited = text.replace(/^-> scrypt (\S)/m, (_m, first: string) =>
      `-> scrypt ${first === 'A' ? 'B' : 'A'}`,
    )
    expect(edited).not.toBe(text)
    await expect(open(Buffer.from(edited, 'latin1'), PASS)).rejects.toThrow()
  })

  it('refuses an archive truncated to a shorter one', async () => {
    const big = Buffer.alloc(1024 * 1024 + 500, 0x5a)
    const sealed = await seal(big, PASS)
    await expect(open(sealed.subarray(0, sealed.length - 64), PASS)).rejects.toThrow()
  })

  it('refuses data appended past the end', async () => {
    const sealed = await seal(PLAIN, PASS)
    await expect(
      open(Buffer.concat([sealed, Buffer.from('and something extra')]), PASS),
    ).rejects.toThrow()
  })

  it('refuses something that is not an archive', async () => {
    await expect(open(Buffer.from('PK a plain zip'), PASS)).rejects.toBeInstanceOf(
      MalformedEnvelope,
    )
  })

  it('calls a damaged archive damaged, not a wrong passphrase', async () => {
    // **The two answers send an analyst to different places**, and getting it
    // backwards is expensive: told the passphrase is wrong, they retype one
    // that was right and conclude they have lost it. Measured 2026-08-14, a
    // truncated header and a garbage body both classified as `WrongPassphrase`
    // because the mapping listed the malformed spellings and fell through.
    const sealed = await seal(PLAIN, PASS)
    await expect(open(sealed.subarray(0, 60), PASS)).rejects.toBeInstanceOf(MalformedEnvelope)

    const junk = Buffer.from('age-encryption.org/v1\n-> nope\nnot a real body\n', 'latin1')
    await expect(open(junk, PASS)).rejects.toBeInstanceOf(MalformedEnvelope)

    // ...and the one message that really is a wrong key still is one.
    await expect(open(sealed, 'a-different-passphrase')).rejects.toBeInstanceOf(WrongPassphrase)
  })

  it('refuses a format version it does not read', async () => {
    const sealed = await seal(PLAIN, PASS)
    const tampered = Buffer.from(sealed.toString('latin1').replace('/v1', '/v9'), 'latin1')
    // `isSealed` is checked first and reads the magic, so this must survive that
    // gate to reach age at all - it does, because only the version digit moved.
    await expect(open(tampered, PASS)).rejects.toThrow()
  })
})

/**
 * What an uploaded archive gets to choose, and what it costs the process.
 */
describe('the work factor an uploaded archive names', () => {
  it('opens what this build writes', async () => {
    await expect(open(await withWorkFactor(WORK_FACTOR), PASS)).resolves.toBeInstanceOf(Buffer)
  })

  it.each([WORK_FACTOR + 1, 18, 20])('refuses 2^%i, dearer than this app writes', async (logN) => {
    // Refused before age sees it, and before the passphrase can even be wrong.
    await expect(open(await withWorkFactor(logN), PASS)).rejects.toBeInstanceOf(MalformedEnvelope)
  })

  it('refuses the dear one without deriving a key at all', async () => {
    // The point of the bound is cost, so a refusal that still paid for scrypt
    // would be no defence. 2^20 measured 2431ms; this must return promptly.
    const dear = await withWorkFactor(20)
    const started = process.hrtime.bigint()
    await expect(open(dear, PASS)).rejects.toBeInstanceOf(MalformedEnvelope)
    expect(Number(process.hrtime.bigint() - started) / 1e6).toBeLessThan(100)
  })
})
