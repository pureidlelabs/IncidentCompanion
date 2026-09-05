/**
 * `sniffImageType` and `toPng` on their own, with no database and no route -
 * the pure functions the controller's upload path leans on.
 */
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { SIZE, UnusableImage, sniffImageType, toPng } from './avatar-image.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A real 1x1 PNG, not four magic bytes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
)

describe('sniffImageType', () => {
  it('identifies a real PNG by its magic bytes', () => {
    expect(sniffImageType(PNG)).toBe('image/png')
  })

  it('identifies a real JPEG by its magic bytes', async () => {
    const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
      .jpeg()
      .toBuffer()
    expect(sniffImageType(jpeg)).toBe('image/jpeg')
  })

  it('identifies a real WebP by its RIFF/WEBP container', async () => {
    const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
      .webp()
      .toBuffer()
    expect(sniffImageType(webp)).toBe('image/webp')
  })

  /**
   * **The attack this route exists to stop.**
   */
  it('does not identify SVG bytes as any accepted format', () => {
    expect(sniffImageType(SVG)).toBeUndefined()
  })

  it('does not identify an unrelated file as any accepted format', () => {
    expect(sniffImageType(Buffer.from('MZ this is a PE header, not a picture'))).toBeUndefined()
  })

  it('does not throw on a body shorter than any magic number', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeUndefined()
    expect(sniffImageType(Buffer.from([0x89]))).toBeUndefined()
  })
})

describe('toPng', () => {
  it('re-encodes a real PNG', async () => {
    const out = await toPng(PNG)
    expect(out.subarray(0, 8)).toEqual(PNG_SIGNATURE)
  })

  /**
   * **Documents the finding, does not defend against it.**
   */
  it('decodes SVG bytes when handed directly, which is why a caller must sniff first', async () => {
    const out = await toPng(SVG)
    expect(out.subarray(0, 8)).toEqual(PNG_SIGNATURE)
  })

  it('refuses bytes that are not a readable image', async () => {
    await expect(toPng(Buffer.from('not a picture'))).rejects.toBeInstanceOf(UnusableImage)
  })

  it('refuses an empty buffer', async () => {
    await expect(toPng(Buffer.alloc(0))).rejects.toBeInstanceOf(UnusableImage)
  })

  it('squares the output to SIZE', async () => {
    const out = await toPng(PNG)
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(SIZE)
    expect(meta.height).toBe(SIZE)
  })
})
