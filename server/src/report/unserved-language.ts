/**
 * Refuse a write naming a language this install cannot serve.
 *
 * **Here rather than in `languages/`, because what it returns is a
 * `ClosedRowGuard`** -- a report's own idea of a check that runs against a row
 * before it is written. The languages module knows what a pack is and where
 * one is stored; it does not know what a frozen report is, and an edge back to
 * find out would be the near end of a cycle.
 */
import { UnprocessableEntityException } from '@nestjs/common'
import { inArray } from 'drizzle-orm'

import { reportLanguage } from '../db/schema/language.js'
import { ENGLISH } from '../languages/language.service.js'
import type { ClosedRowGuard } from './freeze.js'

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
