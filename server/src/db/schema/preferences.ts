/**
 * What one analyst chose, as opposed to what the install decided: theme, how
 * time is displayed, avatar.
 *
 * Display name and password are absent - Better Auth owns the `user` row and
 * its credential.
 */
import {
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

import { user } from './auth.js'

export const themeChoice = pgEnum('theme_choice', ['light', 'dark', 'system'])

/**
 * Which clock a timestamp is drawn in; `local` is the browser's zone. A
 * rendered report is a separate question and is not answered here, because a
 * document has no viewer to consult.
 */
export const clockChoice = pgEnum('clock_choice', ['local', 'utc'])

const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

export const preferences = pgTable('preferences', {
  /**
   * One row per analyst, and the id is the key. **Cascades**: a preference
   * belonging to a deleted account is a row nothing can ever read.
   */
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),

  theme: themeChoice('theme').notNull().default('system'),
  clock: clockChoice('clock').notNull().default('local'),

  /**
   * Index into the presence palette; null means derive it from the name.
   * **Deriving stays the default** so an install where nobody has chosen looks
   * unchanged, and one analyst choosing does not move anybody else's colour.
   */
  tone: integer('tone'),
  /** At most two characters, upper-cased by the server. */
  initials: text('initials'),

  /**
   * The image itself, in Postgres rather than on a disk, and stored exactly as
   * uploaded - nothing re-encodes it, so `avatarType` is the uploader's word
   * and the read route sends `nosniff`.
   */
  avatar: bytes('avatar'),
  avatarType: text('avatar_type'),
  /**
   * Bumped on every image write so the URL changes and the response can be
   * cached hard. **Not the bytes in the roster**: presence is read on every
   * case, and an image per analyst would be hundreds of kilobytes of base64 in
   * a list that mostly draws initials.
   */
  avatarVersion: integer('avatar_version').notNull().default(0),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type PreferencesRow = typeof preferences.$inferSelect

/**
 * What the *install* has decided, as against what one analyst prefers.
 *
 * Key-value: the keys are a closed vocabulary and `install.service.ts` holds
 * the schema that refuses an unknown one. Not scoped to a case or an analyst,
 * and under no row-level security.
 */
export const installPreferences = pgTable('install_preferences', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
})

export type InstallPreferenceRow = typeof installPreferences.$inferSelect
