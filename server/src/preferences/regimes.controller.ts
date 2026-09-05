/**
 * `GET /api/regimes` - which regulatory regimes this install surfaces.
 */
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'
import { BadRequestException } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'

import { AdminOnly } from '../auth/admin-only.js'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { InstallPreferencesService } from './install.service.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'

/**
 * The three, and what a screen calls each.
 */
const REGIMES: readonly { key: string; label: string }[] = [
  { key: 'gdpr', label: 'GDPR' },
  { key: 'nis2', label: 'NIS2' },
  { key: 'dora', label: 'DORA' },
]

const switchSchema = z.object({ enabled: z.boolean() }).strict()

/**
 * **A DTO rather than `unknown` parsed by hand.**
 */
class SwitchDto extends createZodDto(switchSchema) {}

/**
 * **Both routes answer with this, because a write answers with the new
 * state.**
 */
export const regimesViewSchema = z.object({
  enabled: z.boolean().describe('The compliance master switch.'),
  regimes: z.record(
    z.string(),
    z.object({
      label: z.string(),
      enabled: z.boolean().describe('What a screen acts on: the master and this regime.'),
      preference: z.boolean().describe('What a settings control draws: this regime alone.'),
    }),
  ),
})

export type RegimesView = z.infer<typeof regimesViewSchema>

class RegimesViewDto extends createZodDto(regimesViewSchema) {}

@Controller('api/regimes')
export class RegimesController {
  constructor(
    private readonly settings: InstallPreferencesService,
    private readonly activity: InstallActivityService,
  ) {}

  /**
   * **`enabled` is the master ANDed with the regime's own; `preference` is the
   * regime's alone.**
   */
  @Get()
  @ZodResponse({
    status: 200,
    type: RegimesViewDto,
    description: 'Which regimes this install surfaces, and whether each is on.',
  })
  async list(): Promise<RegimesView> {
    const held = await this.settings.all()
    const master = held['compliance.enabled'] === true

    return {
      enabled: master,
      regimes: Object.fromEntries(
        REGIMES.map(({ key, label }) => {
          const own = held[`compliance.regime.${key}` as keyof typeof held] === true
          return [key, { label, enabled: master && own, preference: own }]
        }),
      ),
    }
  }

  /**
   * Turn a regime on or off.
   */
  @Post(':name')
  @ZodResponse({
    status: 200,
    type: RegimesViewDto,
    description: 'The regimes as they now stand, so a caller need not re-read.',
  })
  @AdminOnly()
  async set(
    @Param('name') name: string,
    @Body() body: SwitchDto,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<RegimesView> {
    const known = REGIMES.some((one) => one.key === name) || name === 'compliance'
    if (!known) {
      throw new BadRequestException(
        `No regime "${name}". This install has: ${REGIMES.map((one) => one.key).join(', ')}.`,
      )
    }
    const key = name === 'compliance' ? 'compliance.enabled' : `compliance.regime.${name}`
    await this.settings.set(key, body.enabled, session.user.id)
    await this.activity.regimeSwitched(
      { session, headers: request.headers, request },
      name,
      body.enabled,
    )
    return this.list()
  }
}
