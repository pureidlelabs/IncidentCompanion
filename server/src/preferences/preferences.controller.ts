/**
 * The analyst's own settings, under the analyst - not `/api/settings`, which
 * is the install's policy.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'

import { UnusableImage, sniffImageType, toPng } from './avatar-image.js'
import { z } from 'zod'
import { ZodResponse, createZodDto } from 'nestjs-zod'

import { PreferencesService, type AppearanceRow, type PreferencesView, preferencesViewSchema, appearanceRowSchema } from './preferences.service.js'

/**
 * **`.strict()`, so an unknown key is a 400 rather than a silent no-op.**
 */
const patchSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    clock: z.enum(['local', 'utc']),
    tone: z.number().int().min(0).max(11).nullable(),
    initials: z.string().nullable(),
  })
  .partial()
  .strict()

/**
 * The shapes these routes answer with, as DTOs the compiler can hold the
 * handlers to. -> the pattern in `health/about.controller.ts`
 */
class PreferencesDto extends createZodDto(preferencesViewSchema) {}
class RosterDto extends createZodDto(z.object({ rows: z.array(appearanceRowSchema) })) {}
class AvatarVersionDto extends createZodDto(
  z.object({
    avatarVersion: z
      .number()
      .int()
      .describe('Bumped on every change, so a cached picture is dropped.'),
  }),
) {}

/**
 * A cheap first refusal on the claimed type, ahead of the decode that decides.
 */
const ALLOWED_IMAGES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** Generous for an avatar and far under what a form can post by accident. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

/**
 * **Mounted at `api/appearance`, which is what the client calls.**
 */
class PreferencesPatchDto extends createZodDto(patchSchema) {}

@Controller('api/appearance')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ZodResponse({ status: 200, type: PreferencesDto, description: 'This analyst\u2019s own settings.' })
  read(@Session() session: UserSession): Promise<PreferencesView> {
    return this.preferences.read(session.user.id)
  }

  /**
   * Everybody's disc, for the screens that draw other people.
   */
  @Get('roster')
  @ZodResponse({ status: 200, type: RosterDto, description: 'How every analyst appears on screen.' })
  roster(): Promise<{ rows: AppearanceRow[] }> {
    return this.preferences.roster().then((rows) => ({ rows }))
  }

  /**
   * **`async` although nothing here awaits.**
   */
  @Patch()
  @ZodResponse({ status: 200, type: PreferencesDto, description: 'The settings as stored.' })
  async write(
    @Body() body: PreferencesPatchDto,
    @Session() session: UserSession,
  ): Promise<PreferencesView> {
    return this.preferences.write(session.user.id, body)
  }

  /**
   * **The body is the image.**
   */
  @ZodResponse({
    status: 200,
    type: AvatarVersionDto,
    description: 'The picture is stored; the version is what drops a cached copy.',
  })
  @Put('avatar')
  async setAvatar(
    @Req() request: AsyncIterable<Buffer> & { headers: Record<string, string | undefined> },
    @Session() session: UserSession,
  ): Promise<{ avatarVersion: number }> {
    const type = (request.headers['content-type'] ?? '').split(';')[0]!.trim()
    if (!ALLOWED_IMAGES.has(type)) {
      throw new BadRequestException({
        message: `An avatar is ${[...ALLOWED_IMAGES].sort().join(', ')}.`,
      })
    }

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > MAX_AVATAR_BYTES) {
        throw new BadRequestException({
          message: `An avatar is at most ${MAX_AVATAR_BYTES / 1024 / 1024}MB.`,
        })
      }
      chunks.push(chunk)
    }
    if (size === 0) throw new BadRequestException({ message: 'No image was sent.' })

    const bytes = Buffer.concat(chunks)

    /**
     * **The declared type is checked above; this checks the bytes.**
     */
    if (sniffImageType(bytes) !== type) {
      throw new BadRequestException({
        message: `An avatar is ${[...ALLOWED_IMAGES].sort().join(', ')}.`,
      })
    }

    /**
     * **What gets stored is this process's own output, not the upload.**
     */
    let png: Buffer
    try {
      png = await toPng(bytes)
    } catch (error) {
      if (error instanceof UnusableImage) {
        throw new BadRequestException({ message: error.message })
      }
      throw error
    }

    // **`image/png` regardless of what arrived**, because that is what is now
    // stored. Recording the uploader's type beside our own bytes would be a
    // label that disagrees with the file.
    return this.preferences.setAvatar(session.user.id, png, 'image/png')
  }

  @ZodResponse({
    status: 200,
    type: AvatarVersionDto,
    description: 'The picture is gone; the version is what drops a cached copy.',
  })
  @Delete('avatar')
  clearAvatar(@Session() session: UserSession): Promise<{ avatarVersion: number }> {
    return this.preferences.clearAvatar(session.user.id)
  }

  /**
   * **Named, because a presence roster draws everybody's.**
   */
  @Get(':userId/avatar')
  @Header('cache-control', 'private, max-age=31536000, immutable')
  // **Kept even though the bytes are now this process's own PNG.** It costs
  // nothing, and it is the header that stops mattering last: the day someone
  // adds a second upload path, or serves an original alongside, this is already
  // in place rather than remembered.
  @Header('x-content-type-options', 'nosniff')
  async avatar(
    @Param('userId') userId: string,
    @Res({ passthrough: true }) response: { type(value: string): unknown },
  ): Promise<StreamableFile> {
    const found = await this.preferences.avatar(userId)
    // **404, not 400.** The request was well formed and the analyst is real;
    // what is absent is the image. Calling it a bad request sends whoever
    // debugs it looking at the URL.
    if (!found) throw new NotFoundException({ message: 'That analyst has no picture.' })
    response.type(found.type)
    return new StreamableFile(found.bytes, { type: found.type })
  }
}
