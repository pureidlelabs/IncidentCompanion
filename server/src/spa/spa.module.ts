/**
 * The built React app, served by the same process that answers `/api`, so the
 * product runs on one origin without Vite in front of it.
 */
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { resolve, join } from 'node:path'

import { SpaController } from './spa.controller.js'
import type { Env } from '../config/env.js'

/**
 * Where the built front end is: derived from this file rather than from the
 * working directory, which is whatever the launcher was started from.
 *
 * Four levels up, not three - the swc builder preserves the source folder, so
 * this compiles to `dist/src/spa/`. `UI_DIR` overrides it for a layout that is
 * neither, which a container image is.
 */
export function bundlePath(config: ConfigService<Env, true>): string {
  const named = config.get('UI_DIR', { infer: true })
  return named ? resolve(named) : resolve(join(__dirname, '..', '..', '..', '..', 'ui', 'dist'))
}

/**
 * The SPA's fallback route.
 *
 * **The files themselves are served from `main.ts`**, not from here - see the
 * comment there. What is left for a module is the route that answers every
 * address the API did not claim, and it is registered last because it matches
 * all of them.
 */
@Module({
  controllers: [SpaController],
})
export class SpaModule {}
