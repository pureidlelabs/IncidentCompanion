/**
 * Two uploads refused for different reasons are refused in the same words.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { MAX_PIXELS, UnusableImage, toPng } from './avatar-image.js'

/** CRC-32, because rewriting a PNG chunk invalidates the one that follows it. */
function crc32(bytes: Buffer): number {
  let crc = 0xff_ff_ff_ff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xed_b8_83_20 : crc >>> 1
    }
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0
}

/**
 * A real PNG whose header claims an enormous picture.
 */
async function claimsEnormous(side: number): Promise<Buffer> {
  const real = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer()

  const forged = Buffer.from(real)
  // 8 bytes of signature, 4 of length, then the chunk: type at 12, data at 16.
  forged.writeUInt32BE(side, 16)
  forged.writeUInt32BE(side, 20)
  forged.writeUInt32BE(crc32(forged.subarray(12, 29)), 29)
  return forged
}

const refusalFor = async (bytes: Buffer): Promise<string> => {
  const why = await toPng(bytes).then(
    () => null,
    (error: unknown) => error,
  )
  expect(why, 'the upload was accepted, so there is no refusal to compare').toBeInstanceOf(
    UnusableImage,
  )
  return (why as UnusableImage).message
}

describe('two uploads refused for different reasons', () => {
  /**
   * **The two really are different checks**, which is what the case below is
   * about and cannot itself show.
   */
  it('refuses these for genuinely different reasons underneath', async () => {
    const side = Math.ceil(Math.sqrt(MAX_PIXELS)) + 1000
    const causeOf = async (bytes: Buffer) => {
      const why = (await toPng(bytes).catch((error: unknown) => error)) as { cause?: unknown }
      return String(why.cause)
    }

    const bomb = await causeOf(await claimsEnormous(side))
    const garbage = await causeOf(Buffer.from('this is not an image at all, it is a sentence'))

    expect(bomb, 'the forged header was not refused for its pixel count').toContain('pixel limit')
    expect(
      garbage,
      'the garbage was refused for the same reason as the bomb, so the case below compares ' +
        'one cause with itself',
    ).not.toBe(bomb)
  })

  it('says the same thing however the upload was unusable', async () => {
    const side = Math.ceil(Math.sqrt(MAX_PIXELS)) + 1000

    const answers = [
      await refusalFor(await claimsEnormous(side)),
      await refusalFor(Buffer.from('this is not an image at all, it is a sentence')),
      await refusalFor(Buffer.alloc(0)),
    ]

    expect(
      new Set(answers).size,
      `three refusals gave ${String(new Set(answers).size)} different answers, so a sender ` +
        'can tell which check they failed and work on the one that does not fire: ' +
        JSON.stringify(answers),
    ).toBe(1)
  })
})
