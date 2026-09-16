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
import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { eq, inArray } from 'drizzle-orm'

import { DATABASE, SEED_DATABASE, seedRoleMissing } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { reportLanguage } from '../db/schema/language.js'
import type { ClosedRowGuard } from './freeze.js'
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

/**
 * Refuse a report naming a language this install cannot print it in.
 *
 * **Here rather than on the schema, because the terms are rows** and a
 * synchronous refinement has nothing to read.
 *
 * **Three codes are served and only one of them is a row.** `''` is a report
 * that has not chosen, `en` is the source language and never stored, and a
 * pack is a row -- so a check reading the table alone would refuse the first
 * two.
 *
 * **The renderer's fallback is deliberate and is left alone.** A pack removed
 * after a report chose it still prints in English, which is the right answer
 * for a document that already exists. What this refuses is choosing one that
 * never existed. -> `translatorFor`
 */
export function refuseUnservedLanguage(): ClosedRowGuard {
  return async (db, _caseId, target) => {
    const asked = new Set<string>()
    for (const row of target.rows ?? []) {
      const code = row['language']
      if (typeof code === 'string' && code !== '' && code !== ENGLISH.code) asked.add(code)
    }
    if (asked.size === 0) return

    const held = await db
      .select({ code: reportLanguage.code })
      .from(reportLanguage)
      .where(inArray(reportLanguage.code, [...asked]))
    const served = new Set(held.map((one) => one.code))
    const unserved = [...asked].filter((code) => !served.has(code)).sort()

    if (unserved.length > 0) {
      throw new UnprocessableEntityException({
        message: 'This install has no language pack for that code.',
        unserved,
      })
    }
  }
}

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
        builtin: true,
      })
      .onConflictDoUpdate({
        target: reportLanguage.code,
        set: {
          label: dutch.label,
          strings: dutch.strings,
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
        coverage: coverageIn(row.strings),
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

  /**
   * What this install carries for a language, for the freeze to record.
   *
   * **Measured here, never read back.** Coverage is a fact about the pack and
   * the application together: the divisor is the keys the app prints, so a
   * figure stored on the day a pack arrived is measured against a key set that
   * has since moved. A pack uploaded whole went on claiming to be whole, and
   * `coverageNote` -- the line telling a reader the document is part English --
   * is gated on that number, so the case it exists for was the case it was
   * suppressed in. -> #697
   */
  async coverageOf(code: string): Promise<number> {
    if (code === ENGLISH.code) return 1
    const [row] = await this.db.select().from(reportLanguage).where(eq(reportLanguage.code, code))
    return row ? coverageIn(row.strings) : 0
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
        builtin: false,
        uploadedBy: actorId,
      })
      .onConflictDoUpdate({
        target: reportLanguage.code,
        set: {
          label: clean.label,
          strings: clean.strings,
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

  get keyCount(): number {
    return EN_KEYS.length
  }
}
