/**
 * The favicons and the reference's wordmark, at the root paths a browser asks
 * for by convention.
 */
import { Controller, Get, StreamableFile } from '@nestjs/common'
import { Public } from '@thallesp/nestjs-better-auth'
import { createReadStream, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * `server/assets/`, found rather than assumed: the candidates are tried and
 * the one that exists wins, because development starts from `server/` and the
 * container from the image root.
 */
function assetsDir(): string {
  const candidates = [
    resolve(process.cwd(), 'assets'),
    resolve(process.cwd(), 'server', 'assets'),
  ]
  return candidates.find((path) => existsSync(path)) ?? candidates[0]!
}

const ASSETS = assetsDir()

/** What a route hands back: the path so a test can read it, the type for the wire. */
export interface BrandAsset {
  readonly path: string
  readonly type: string
}

@Controller()
export class BrandController {
  /**
   * **Linked by `ui/index.html` and preferred by Chrome and Firefox.**
   */
  faviconSvg(): BrandAsset {
    return { path: join(ASSETS, 'favicon.svg'), type: 'image/svg+xml' }
  }

  /** Safari's fallback: it supports neither SVG icons nor `media` on the link. */
  faviconIco(): BrandAsset {
    return { path: join(ASSETS, 'favicon.ico'), type: 'image/x-icon' }
  }

  @Public()
  @Get('favicon.svg')
  svg(): StreamableFile {
    const asset = this.faviconSvg()
    return new StreamableFile(createReadStream(asset.path), { type: asset.type })
  }

  /**
   * **Requested by convention, not by a link.**
   */
  @Public()
  @Get('favicon.ico')
  ico(): StreamableFile {
    const asset = this.faviconIco()
    return new StreamableFile(createReadStream(asset.path), { type: asset.type })
  }

  /**
   * The lockup the API reference draws above its contents page: the wordmark
   * rather than the mark, rasterised, and the light one because `/api/docs` is
   * pinned to the light tokens.
   */
  @Public()
  @Get('wordmark.png')
  wordmark(): StreamableFile {
    return new StreamableFile(createReadStream(join(ASSETS, 'wordmark-light.png')), {
      type: 'image/png',
    })
  }
}
