/**
 * `GET /api/regimes` - which regulatory regimes this install surfaces.
 *
 * **Its own route, deliberately not part of `/api/specs`**, which every client
 * holds at `staleTime: Infinity`. These switches change while the server runs.
 *
 * **Not rendering the card is the whole guard.** Nothing server-side rejects a
 * field belonging to a regime that is off, so a write arriving moments after a
 * switch flipped still lands.
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
 * Each regime, and what a screen calls it.
 *
 * **Named here rather than derived from the vocabulary modules.** A label is
 * copy; `compliance.ts` holds the taxonomies those regimes are *made of*, which
 * is a different thing from what the switch is called.
 */
const REGIMES: readonly { key: string; label: string }[] = [
  { key: 'gdpr', label: 'GDPR' },
  { key: 'nis2', label: 'NIS2' },
  { key: 'dora', label: 'DORA' },
]

const switchSchema = z.object({ enabled: z.boolean() }).strict()

/**
 * **A DTO rather than `unknown` parsed by hand.** Naming the class as the
 * body's type does three jobs at once: the global pipe validates against it,
 * the reference publishes it as the request body, and the handler receives a
 * value it does not have to check. A hand-rolled `safeParse` does the first
 * and neither of the others.
 */
class SwitchDto extends createZodDto(switchSchema) {}

/**
 * **Both routes answer with this, because a write answers with the new state.**
 * A caller that has just flipped one switch needs the master's effect on the
 * other two, and re-reading to find out would race the next write.
 *
 * `enabled` is the master ANDed with the regime's own; `preference` is the
 * regime's alone - the reason they are separate fields is on `list` below.
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
   * regime's alone.** A screen acts on the first and a settings control renders
   * the second - collapsed into one field, turning compliance off would look
   * like somebody having turned all three regimes off individually, and turning
   * it back on would not restore them.
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
   *
   * **Admin only**, and enforced here rather than where the control is drawn:
   * this route is reachable by any signed-in session that types the URL, so a
   * check living only in the pane is not a check.
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
