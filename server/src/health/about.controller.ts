/**
 * What build this is and under what licence.
 */
import { Controller, Get } from '@nestjs/common'
import { Public } from '@thallesp/nestjs-better-auth'
import { ZodResponse, createZodDto } from 'nestjs-zod'

import { aboutSchema, type About } from '../domain/about.js'

export { aboutSchema, type About }

export class AboutDto extends createZodDto(aboutSchema) {}

/**
 * **Camel-cased, because the client camelises every key at every depth.**
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
   * **`@Public()`, because the sign-in screen has an About door.**
   */
  @Public()
  @Get('about')
  /**
   * **`status` is not optional in practice.**
   */
  @ZodResponse({ status: 200, type: AboutDto, description: 'What this build is.' })
  read(): About {
    return { ...ABOUT }
  }
}
