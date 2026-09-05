/**
 * The languages this install can print a report in.
 *
 * **Reading is open and writing is the admin's**: every analyst's report form
 * needs the list, and uploading a pack changes what every analyst's reports
 * print in a language most reviewers cannot proofread.
 *
 * Served from the report module though the screen is in Settings - a pack is
 * report vocabulary, and where it is drawn is a separate question.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'

import { AdminOnly } from '../auth/admin-only.js'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { languageTag } from '../domain/language-tag.js'

import { LanguageService } from './language.service.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { EN_KEYS } from './document/packs.js'

/**
 * A pack as it arrives.
 *
 * **The strings map is unbounded in key names on purpose** -- the point of
 * validating here is to answer *which* keys were not recognised, and a schema
 * that refused the body outright would leave the uploader with a rejection and
 * no list. `LanguageService.upload` drops them and names them back.
 */
const packSchema = z
  .object({
    // The same rule a snippet's translation key follows, so a pack and the
    // entries written against it cannot disagree about what a language is
    // called. -> `domain/language-tag.ts`
    code: languageTag.max(35),
    label: z.string().trim().min(1).max(80)
      .describe('What the picker shows, in its own language rather than in English.'),
    strings: z.record(z.string(), z.string().max(4000)),
  })
  .strict()

class PackDto extends createZodDto(packSchema) {}

const entrySchema = z.object({
  code: z.string(),
  label: z.string(),
  coverage: z.number().describe('How much of English this pack carries, 0 to 1.'),
  builtin: z.boolean().describe('Shipped with the app. It cannot be removed.'),
})

class LanguagesDto extends createZodDto(
  z.object({
    languages: z.array(entrySchema),
    keyCount: z.number().int().describe('How many strings a complete pack carries.'),
  }),
) {}

class UploadedDto extends createZodDto(
  z.object({
    language: entrySchema,
    ignored: z
      .array(z.string())
      .describe('Keys this app has no place for. Stored for nothing, so they are named.'),
  }),
) {}

class RemovedLanguageDto extends createZodDto(z.object({ removed: z.string() })) {}

@Controller('api/report/languages')
export class LanguageController {
  constructor(
    private readonly languages: LanguageService,
    private readonly activity: InstallActivityService,
  ) {}

  @ZodResponse({ status: 200, type: LanguagesDto, description: 'Every language a report may be written in.' })
  @Get()
  async list() {
    return { languages: await this.languages.list(), keyCount: this.languages.keyCount }
  }

  /**
   * Add a pack, or replace one with the same code.
   *
   * English is refused rather than merged, and so is a pack carrying no usable
   * key at all - storing that puts a 0% language in the report picker, which
   * produces an entirely English document under another language's name.
   */
  @AdminOnly()
  @ZodResponse({ status: 200, type: UploadedDto, description: 'What was stored, and what was ignored.' })
  @Put()
  async upload(
    @Body() body: PackDto,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ) {
    if (body.code.toLowerCase() === 'en') {
      throw new UnprocessableEntityException({
        message: 'English is what every other language falls back to, so it cannot be replaced.',
      })
    }
    const usable = Object.keys(body.strings).filter((key) => EN_KEYS.includes(key)).length
    if (usable === 0) {
      throw new UnprocessableEntityException({
        message: `None of those ${String(Object.keys(body.strings).length)} keys is one this app prints. A pack carries keys like ${EN_KEYS.slice(0, 3).join(', ')}.`,
      })
    }
    const { entry, ignored } = await this.languages.upload(
      { code: body.code, label: body.label, strings: body.strings },
      session.user.id,
    )
    await this.activity.languageUploaded(
      { session, headers: request.headers, request },
      body.code,
      body.label,
      ignored.length,
    )
    return { language: entry, ignored }
  }

  /**
   * Remove an uploaded pack.
   *
   * A built-in is refused: the boot upsert would bring it back on the next
   * restart, and a control that undoes itself is worse than one that is absent.
   */
  @AdminOnly()
  @Delete(':code')
  @ZodResponse({ status: 200, type: RemovedLanguageDto, description: 'The pack is gone.' })
  async remove(
    @Param('code') code: string,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ) {
    if (code === 'en' || (await this.languages.isBuiltin(code))) {
      throw new BadRequestException({
        message: 'That language ships with the app, so removing it would not survive a restart.',
      })
    }
    if (!(await this.languages.has(code))) {
      throw new BadRequestException({ message: `This install has no ${code} pack.` })
    }
    await this.languages.remove(code)
    await this.activity.languageRemoved({ session, headers: request.headers, request }, code)
    return { removed: code }
  }
}
