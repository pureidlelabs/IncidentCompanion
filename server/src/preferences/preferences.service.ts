/**
 * Reading and writing one analyst's own choices.
 *
 * **Every method takes the analyst's id and there is no default.** The same
 * rule as a case write: the caller has the session, this layer does not go
 * looking for one. A preferences service that resolved "the current user"
 * would be the single-user assumption re-entering through the one surface
 * that is defined by *whose* it is.
 */
import { Inject, Injectable, BadRequestException } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { preferences, type PreferencesRow } from '../db/schema/index.js'

/** What the analyst may set. `avatar` is its own route: it is bytes, not a field. */
export interface PreferencesPatch {
  theme?: 'light' | 'dark' | 'system'
  clock?: 'local' | 'utc'
  tone?: number | null
  initials?: string | null
}

/**
 * One analyst's disc, as everybody else may see it.
 *
 * **Keyed by id, never by name.** `user.name` is not unique, so a name-keyed
 * roster hands two analysts called Sam each other's face and each other's
 * colour.
 */
export const appearanceRowSchema = z.object({
  userId: z.string(),
  tone: z.number().int().optional(),
  initials: z.string().optional(),
  avatarVersion: z.number().int().optional(),
})

export type AppearanceRow = z.infer<typeof appearanceRowSchema>

/** What a client reads, with the row's absence rendered as the defaults. */
export const preferencesViewSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  clock: z.enum(['local', 'utc']),
  tone: z.number().int().optional(),
  initials: z.string().optional(),
  avatarVersion: z.number().int().optional(),
})

export type PreferencesView = z.infer<typeof preferencesViewSchema>

/**
 * **An analyst who has never chosen has no row, and that is not an error.**
 * Writing a row of defaults at first sign-in would make "has chosen nothing"
 * indistinguishable from "chose the defaults" - which matters the day a
 * default changes and everyone who never chose should move with it.
 */
const UNCHOSEN: PreferencesView = { theme: 'system', clock: 'local' }

@Injectable()
export class PreferencesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private static view(row: PreferencesRow | undefined): PreferencesView {
    if (!row) return { ...UNCHOSEN }
    return {
      theme: row.theme,
      clock: row.clock,
      ...(row.tone !== null ? { tone: row.tone } : {}),
      ...(row.initials !== null ? { initials: row.initials } : {}),
      // Absent rather than 0, so a client can ask "is there an image" without
      // knowing that 0 is the number meaning no.
      ...(row.avatarVersion > 0 ? { avatarVersion: row.avatarVersion } : {}),
    }
  }

  async read(userId: string): Promise<PreferencesView> {
    const [row] = await this.db.select().from(preferences).where(eq(preferences.userId, userId))
    return PreferencesService.view(row)
  }

  /**
   * What every disc on the screen is drawn from - install-wide, and the only
   * read here that crosses between analysts.
   *
   * The columns are named to leave `avatar` behind, and the mapping below is
   * what keeps the theme and the clock out of the response.
   */
  async roster(): Promise<AppearanceRow[]> {
    const rows = await this.db
      .select({
        userId: preferences.userId,
        tone: preferences.tone,
        initials: preferences.initials,
        avatarVersion: preferences.avatarVersion,
      })
      .from(preferences)
    return rows.map((row) => ({
      userId: row.userId,
      ...(row.tone !== null ? { tone: row.tone } : {}),
      ...(row.initials !== null ? { initials: row.initials } : {}),
      ...(row.avatarVersion > 0 ? { avatarVersion: row.avatarVersion } : {}),
    }))
  }

  /**
   * Upserted, because the first write is also the first read for most
   * analysts - and a create/update split here is two code paths for one
   * intention, with the race between them belonging to nobody.
   */
  async write(userId: string, patch: PreferencesPatch): Promise<PreferencesView> {
    const initials = patch.initials === undefined ? undefined : normaliseInitials(patch.initials)

    const values = {
      ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
      ...(patch.clock !== undefined ? { clock: patch.clock } : {}),
      ...(patch.tone !== undefined ? { tone: patch.tone } : {}),
      ...(initials !== undefined ? { initials } : {}),
      updatedAt: new Date(),
    }

    const [row] = await this.db
      .insert(preferences)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: preferences.userId, set: values })
      .returning()

    return PreferencesService.view(row)
  }

  /** The stored image, or nothing. The version is the caller's cache key. */
  async avatar(userId: string): Promise<{ bytes: Buffer; type: string } | null> {
    const [row] = await this.db.select().from(preferences).where(eq(preferences.userId, userId))
    if (!row?.avatar || !row.avatarType) return null
    return { bytes: row.avatar, type: row.avatarType }
  }

  /**
   * **The version is bumped, never set.** It is a cache key rather than a
   * count, and two writes that land on the same number would leave one
   * analyst's browser showing the other's old image.
   */
  async setAvatar(userId: string, bytes: Buffer, type: string): Promise<{ avatarVersion: number }> {
    const [row] = await this.db
      .insert(preferences)
      .values({ userId, avatar: bytes, avatarType: type, avatarVersion: 1 })
      .onConflictDoUpdate({
        target: preferences.userId,
        set: {
          avatar: bytes,
          avatarType: type,
          avatarVersion: nextVersion(),
          updatedAt: new Date(),
        },
      })
      .returning()
    return { avatarVersion: row!.avatarVersion }
  }

  /**
   * **Clearing bumps the version too.** A browser holding the old URL would
   * otherwise keep drawing an image the analyst has deleted.
   */
  async clearAvatar(userId: string): Promise<{ avatarVersion: number }> {
    const [row] = await this.db
      .update(preferences)
      .set({ avatar: null, avatarType: null, avatarVersion: nextVersion(), updatedAt: new Date() })
      .where(eq(preferences.userId, userId))
      .returning()
    return { avatarVersion: row?.avatarVersion ?? 0 }
  }
}

/**
 * `avatar_version + 1`, computed by Postgres rather than read-then-written.
 *
 * Two uploads landing together would otherwise both read the same number and
 * both write it, leaving one analyst's browser holding a URL that still points
 * at the other's image.
 */
function nextVersion() {
  return sql`${preferences.avatarVersion} + 1`
}

/**
 * At most two characters, upper-cased.
 *
 * **Refused rather than truncated when it is longer.** Silently shortening
 * "ABC" to "AB" gives the analyst initials they did not choose and no reason
 * why; and an empty string clears back to derived.
 */
function normaliseInitials(given: string | null): string | null {
  if (given === null) return null
  const trimmed = given.trim()
  if (trimmed.length === 0) return null
  if ([...trimmed].length > 2) {
    throw new BadRequestException({ message: 'Initials are at most two characters.' })
  }
  return trimmed.toUpperCase()
}
