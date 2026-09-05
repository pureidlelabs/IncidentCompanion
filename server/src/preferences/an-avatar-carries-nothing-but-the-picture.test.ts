/**
 * Whatever an image carries beside the picture does not survive re-encoding.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { toPng } from './avatar-image.js'

/** Distinctive enough that finding it in the output cannot be a coincidence. */
const MARKER = 'IncidentCompanionMetadataProbe'

/** A small red square, which is all the picture this needs to be. */
const picture = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 0, b: 0 } } })

describe('an avatar carrying more than a picture', () => {
  it('is handed something that really does carry the marker', async () => {
    const withMetadata = await picture()
      .withExif({ IFD0: { Copyright: MARKER, Artist: MARKER } })
      .jpeg()
      .toBuffer()

    expect(
      withMetadata.includes(MARKER),
      'the fixture does not carry the marker, so finding it absent below would prove nothing',
    ).toBe(true)
  })

  it('serves back a picture with none of it', async () => {
    const withMetadata = await picture()
      .withExif({ IFD0: { Copyright: MARKER, Artist: MARKER } })
      .jpeg()
      .toBuffer()

    const served = await toPng(withMetadata)

    expect(
      served.includes(MARKER),
      'what the application serves still carries what the analyst uploaded beside the ' +
        'picture, so an avatar publishes whatever their camera recorded',
    ).toBe(false)
  })

  /**
   * The re-encoding is the mechanism, so the served bytes are also asserted to
   * be a PNG this process produced rather than the JPEG it was handed.
   */
  it('serves a PNG rather than the bytes it was given', async () => {
    const given = await picture().withExif({ IFD0: { Copyright: MARKER } }).jpeg().toBuffer()
    const served = await toPng(given)

    expect(served.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(served.equals(given)).toBe(false)
  })
})
