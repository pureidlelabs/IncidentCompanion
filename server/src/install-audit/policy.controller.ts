/**
 * The install's security policy, read and set in one place.
 *
 * **One route for every bound rather than a route per setting.** They are the
 * same act - an administrator moving a bound - and they share a refusal, an
 * audit line and a shape. A route each would be one copy of this per key, and
 * the last one written is the one that forgets to record the change.
 *
 * **Every value is served with its floor and its ceiling**, so a screen states
 * what the server will refuse rather than hard-coding it and drifting.
 *
 * **A key nothing declared is refused, not stored.** The body is checked
 * against the registry rather than passed through, or this route is a way to
 * write arbitrary rows into the settings table.
 */
import { Body, Controller, Get, Put, Req, UnprocessableEntityException } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import type { IncomingHttpHeaders } from 'node:http'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { AdminOnly } from '../auth/admin-only.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { POLICY_SETTINGS, type PolicyKey } from '../policy/keys.js'
import { InstallPreferencesService } from '../preferences/install.service.js'

const KEYS = Object.keys(POLICY_SETTINGS) as [PolicyKey, ...PolicyKey[]]

export const policyValueSchema = z.object({
  value: z.number().int(),
  /** What the server refuses below, so a screen need not repeat it. */
  floor: z.number().int(),
  /** And above. A ceiling is what stops a setting turning its control off. */
  ceiling: z.number().int(),
})

export const policySchema = z.object({
  settings: z.record(z.enum(KEYS), policyValueSchema),
})

export type PolicyView = z.infer<typeof policySchema>

class PolicyDto extends createZodDto(policySchema) {}

/**
 * **One key at a time, and the key must be one of ours.**
 *
 * `z.enum` over the registry is what refuses `{"key": "anything"}` - without
 * it this handler writes whatever it is handed into the settings table, which
 * is a write path an administrator's session should not have either.
 */
export const putPolicySchema = z
  .object({
    key: z.enum(KEYS),
    value: z.number().int(),
  })
  .strict()

class PolicyPutDto extends createZodDto(putPolicySchema) {}

@AdminOnly()
@Controller('api/install/policy')
export class InstallPolicyController {
  constructor(
    private readonly settings: InstallPreferencesService,
    private readonly activity: InstallActivityService,
  ) {}

  @Get()
  @ZodResponse({
    status: 200,
    type: PolicyDto,
    description: 'Every policy bound, with the floor and ceiling the server enforces.',
  })
  async read(): Promise<PolicyView> {
    const held = await this.settings.all()
    const settings = {} as PolicyView['settings']
    for (const key of KEYS) {
      settings[key] = {
        value: Number(held[key] ?? POLICY_SETTINGS[key].fallback),
        floor: POLICY_SETTINGS[key].floor,
        ceiling: POLICY_SETTINGS[key].ceiling,
      }
    }
    return { settings }
  }

  @Put()
  @ZodResponse({
    status: 200,
    type: PolicyDto,
    description: 'The policy as it now stands. The change is recorded on the audit.',
  })
  async set(
    @Body() body: PolicyPutDto,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<PolicyView> {
    const bound = POLICY_SETTINGS[body.key]
    /**
     * **The bounds are checked here as well as in the schema the setting is
     * read back through.** A value that slipped past would be read as the
     * default on the next request - so the control would be correct and the
     * screen would show a number nothing was using, which is worse than a
     * refusal.
     */
    if (body.value < bound.floor || body.value > bound.ceiling) {
      throw new UnprocessableEntityException({
        ok: false,
        messages: [
          [
            `${body.key} must be between ${String(bound.floor)} and ${String(bound.ceiling)}.`,
            'negative',
          ],
        ],
      })
    }

    // Read before writing, or the line cannot say what it changed from.
    const before = Number((await this.settings.all())[body.key] ?? bound.fallback)
    await this.settings.set(body.key, body.value, session.user.id)
    await this.activity.settingChanged(
      { session, headers: request.headers, request },
      body.key,
      before,
      body.value,
    )

    return this.read()
  }
}
