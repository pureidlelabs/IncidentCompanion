/**
 * An uploaded avatar, turned into bytes this app is willing to serve: what
 * leaves is a PNG this process encoded from a decoded bitmap, never the
 * uploaded file.
 */
import sharp from 'sharp'

/** What the encoded avatar is squared to. Bigger than any place it is drawn. */
export const SIZE = 256

/**
 * **The decoded ceiling, and the one a byte cap cannot express.** 40M pixels is
 * a 6300x6300 photograph - past anything an avatar needs and far under what a
 * crafted file claims.
 */
export const MAX_PIXELS = 40_000_000

export class UnusableImage extends Error {}

/**
 * The magic bytes that identify the three formats this route accepts.
 */
export type SniffedImageType = 'image/png' | 'image/jpeg' | 'image/webp'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])

/**
 * The declared content type is the uploader's word; this is the bytes' own.
 */
export function sniffImageType(bytes: Buffer): SniffedImageType | undefined {
  if (bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return 'image/png'
  if (bytes.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) return 'image/jpeg'
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return undefined
}

/**
 * Decode, square with `cover`, and re-encode as PNG.
 */
export async function toPng(raw: Buffer): Promise<Buffer> {
  try {
    return await sharp(raw, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .rotate() // honours EXIF orientation, then drops the tag with the metadata
      .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9 })
      .toBuffer()
  } catch (error) {
    /**
     * **The pixel refusal is not distinguished from a malformed one**, and that
     * is deliberate: both mean "this file is not usable as an avatar", and
     * telling a caller which bound it hit tells them how to approach the other.
     */
    throw new UnusableImage(
      'That image could not be read. Use a PNG, JPEG or WebP under ' +
        `${MAX_PIXELS / 1_000_000} megapixels.`,
      { cause: error },
    )
  }
}
