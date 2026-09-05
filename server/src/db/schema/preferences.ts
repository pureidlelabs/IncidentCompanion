/**
 * What one analyst chose, as opposed to what the install decided: theme, how
 * time is displayed, avatar.
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

/**
 * `system` follows the operating system and is the default, so an install
 * where nobody has chosen looks exactly as it did.
 */
export const themeChoice = pgEnum('theme_choice', ['light', 'dark', 'system'])

/**
 * Which clock a timestamp is drawn in; `local` is the browser's zone.
 */
export const clockChoice = pgEnum('clock_choice', ['local', 'utc'])

/** `bytea`, which Drizzle has no first-class column for. */
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
   * cached hard.
   */
  avatarVersion: integer('avatar_version').notNull().default(0),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type PreferencesRow = typeof preferences.$inferSelect

/**
 * What the *install* has decided, as against what one analyst prefers.
 */
export const installPreferences = pgTable('install_preferences', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Who last changed it. Null for a value this install has never set. */
  updatedBy: text('updated_by'),
})

export type InstallPreferenceRow = typeof installPreferences.$inferSelect
