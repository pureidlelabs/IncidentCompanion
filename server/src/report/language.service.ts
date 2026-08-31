/**
 * Which languages this install can print a report in.
 *
 * The list is derived from what is stored, so uploading a pack is enough - no
 * code change and no rebuild.
 *
 * **English is synthesised rather than stored**: always present, always 1, and
 * an upload naming it is refused, because every other pack's coverage is a
 * fraction of its key set. -> `document/packs.ts`
 *
 * Dutch is a seeded row, upserted on boot like the report layouts, so what the
 * app ships and what an install adds are the same kind of thing.
 */
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'

import { DATABASE, SEED_DATABASE, seedRoleMissing } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { reportLanguage } from '../db/schema/language.js'
import {
  EN_KEYS,
  type LanguageEntry,
  type Pack,
  coverageIn,
  orderedLanguages,
  packFrom,
  translatorFor,
  unknownKeysIn,
} from './document/packs.js'
import type { Translate } from './document/packs.js'
import { NL } from './document/labels.nl.js'

/** English's own entry, which is never a row. */
const ENGLISH = { code: 'en', label: 'English' }

export type { LanguageEntry }

@Injectable()
export class LanguageService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SEED_DATABASE) private readonly seed: Database | null,
  ) {}

  /**
   * Ship Dutch as a row.
   *
   * Upserted on `code` for the same reason the library's built-ins are: a
   * restart must not duplicate it, and an improvement to the shipped pack has
   * to reach an install that already has the old one.
   */
  async seedBuiltIn(): Promise<void> {
    if (!this.seed) throw new Error(seedRoleMissing('the shipped language pack'))
    const dutch = packFrom({ code: 'nl', label: 'Nederlands', strings: NL })
    await this.seed
      .insert(reportLanguage)
      .values({
        code: dutch.code,
        label: dutch.label,
        strings: dutch.strings,
        coverage: coverageIn(dutch.strings),
        builtin: true,
      })
      .onConflictDoUpdate({
        target: reportLanguage.code,
        set: {
          label: dutch.label,
          strings: dutch.strings,
          coverage: coverageIn(dutch.strings),
          builtin: true,
          updatedAt: new Date(),
        },
      })
  }

  /**
   * Every language the report form may offer.
   *
   * **English leads and the rest sort by their own name.** English is not one
   * option among several; the rest have no ranking worth inventing, and an
   * unordered list is one that reorders when a pack is uploaded.
   */
  async list(): Promise<LanguageEntry[]> {
    const rows = await this.db.select().from(reportLanguage)
    return orderedLanguages(
      rows.map((row) => ({
        code: row.code,
        label: row.label,
        coverage: row.coverage,
        builtin: row.builtin,
      })),
    )
  }

  /**
   * The translator a document prints with, resolved once.
   *
   * An unknown code gets English rather than an error: a report asking for a
   * language this install removed is a document that should still print.
   */
  async translatorFor(code: string): Promise<Translate> {
    if (code === ENGLISH.code) return translatorFor(undefined)
    const [row] = await this.db.select().from(reportLanguage).where(eq(reportLanguage.code, code))
    if (!row) return translatorFor(undefined)
    return translatorFor({ code: row.code, label: row.label, strings: row.strings })
  }

  /** What this install carried for a language, for the freeze to record. */
  async coverageOf(code: string): Promise<number> {
    if (code === ENGLISH.code) return 1
    const [row] = await this.db.select().from(reportLanguage).where(eq(reportLanguage.code, code))
    return row?.coverage ?? 0
  }

  async has(code: string): Promise<boolean> {
    if (code === ENGLISH.code) return true
    const [row] = await this.db.select().from(reportLanguage).where(eq(reportLanguage.code, code))
    return row !== undefined
  }

  /**
   * Store an uploaded pack, replacing one with the same code.
   *
   * Returns what was kept and what was not, because a pack whose keys are
   * mostly typos otherwise lands as "41% translated" with no way to find out
   * why. The unknown keys are named rather than counted.
   */
  async upload(pack: Pack, actorId: string): Promise<{ entry: LanguageEntry; ignored: string[] }> {
    const ignored = unknownKeysIn(pack.strings)
    const clean = packFrom(pack)
    const coverage = coverageIn(clean.strings)
    await this.db
      .insert(reportLanguage)
      .values({
        code: clean.code,
        label: clean.label,
        strings: clean.strings,
        coverage,
        builtin: false,
        uploadedBy: actorId,
      })
      .onConflictDoUpdate({
        target: reportLanguage.code,
        set: {
          label: clean.label,
          strings: clean.strings,
          coverage,
          uploadedBy: actorId,
          updatedAt: new Date(),
        },
      })
    const [row] = await this.db.select().from(reportLanguage).where(eq(reportLanguage.code, clean.code))
    return {
      entry: {
        code: clean.code,
        label: clean.label,
        coverage,
        builtin: row?.builtin ?? false,
      },
      ignored,
    }
  }

  /** Remove an uploaded pack. A built-in is refused by the controller. */
  async remove(code: string): Promise<void> {
    await this.db.delete(reportLanguage).where(eq(reportLanguage.code, code))
  }

  async isBuiltin(code: string): Promise<boolean> {
    const [row] = await this.db.select().from(reportLanguage).where(eq(reportLanguage.code, code))
    return row?.builtin ?? false
  }

  /** How many keys a complete pack carries, for the upload screen to say so. */
  get keyCount(): number {
    return EN_KEYS.length
  }
}
