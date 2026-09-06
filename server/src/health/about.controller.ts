/**
 * What build this is and under what licence.
 *
 * Constants, never `package.json`: the package version means "this npm
 * package", and the product has cut no release to name.
 */
import { Controller, Get } from '@nestjs/common'
import { Public } from '@thallesp/nestjs-better-auth'
import { ZodResponse, createZodDto } from 'nestjs-zod'

import { aboutSchema, type About } from '../domain/about.js'

export { aboutSchema, type About }

export class AboutDto extends createZodDto(aboutSchema) {}

/**
 * **Camel-cased, because the client camelises every key at every depth.** A
 * key served in the underscore form reads `undefined` on screen and fails
 * nothing.
 */
const REPO_URL = 'https://github.com/pureidlelabs/IncidentCompanion'

const ABOUT = {
  version: 'internal-dev',
  license: 'AGPL-3.0-only',
  copyright: '© 2026 Boudewijn van Silfhout',
  siteUrl: 'https://incidentcompanion.com',
  makerUrl: 'https://pureidle.dev',
  repoUrl: REPO_URL,
  issuesUrl: `${REPO_URL}/issues`,
} as const satisfies About

@Controller('api')
export class AboutController {
  /**
   * **`@Public()`, because the sign-in screen has an About door.** The
   * unauthenticated screens carry the same dialog the session menu does, so a
   * session gate here answers 401 to the caller most likely to ask -- somebody
   * deciding whether to sign into this install at all.
   *
   * **What that discloses is the same in every copy of this software**: the
   * version, the licence, the copyright and three project URLs. Nothing about
   * the machine, the install or the cases. Its sibling
   * `/api/health/resources` stays behind a session for exactly that contrast,
   * and `about.controller.test.ts` pins both.
   */
  @Public()
  @Get('about')
  /**
   * **`status` is not optional in practice.** Left off, `ZodResponse` files
   * the shape under `default` rather than `200` - measured - so the reference
   * shows a fallback response and no success one, and every generated client
   * treats it as the error case.
   *
   * **The decorator is the point, not the documentation.** Its signature
   * constrains this method's return type to the schema's output, so a handler
   * that drifts is a compile error (TS1241) rather than a document that
   * quietly lies. That is what `openapi.ts`'s maps cannot do, and why the
   * remaining response shapes should arrive this way.
   */
  @ZodResponse({ status: 200, type: AboutDto, description: 'What this build is.' })
  read(): About {
    return { ...ABOUT }
  }
}
