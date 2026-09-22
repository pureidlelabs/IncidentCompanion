/**
 * What this install expects to find beside it, and what it cannot.
 *
 * Counts the artefacts the evidence rows say this install holds against the
 * names in `EVIDENCE_DIR`. Reads names, never bytes, and never throws for an
 * absent directory. -> `openspec/specs/state/design.md`
 */
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.js'
import { isNotNull } from 'drizzle-orm'
import { readdir } from 'node:fs/promises'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { withCase } from '../db/scope.js'
import { cases } from '../db/schema/case.js'
import { evidence } from '../db/schema/entities.js'

/** What the install expects, and how much of it is not there. */
export interface Census {
  /** Distinct artefacts the rows name. */
  expected: number
  /** How many of those the install cannot find. */
  missing: number
}

/** The line this install says at start, or null when it has nothing to say. */
export function saysAtStart(held: Census): { level: 'log' | 'warn'; message: string } | null {
  if (held.expected === 0) return null
  if (held.missing === 0) {
    return {
      level: 'log',
      message: `All ${String(held.expected)} attached artefacts are beside this install.`,
    }
  }
  return {
    level: 'warn',
    message:
      `${String(held.missing)} of ${String(held.expected)} attached artefacts are not beside ` +
      'this install. A database restored without its evidence directory reads as well until ' +
      'somebody opens a case that has evidence on it.',
  }
}

@Injectable()
export class ArtefactCensus {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Count what this install holds against what is on disk.
   *
   * A directory that is not there is read as holding nothing, which is the
   * state this exists to report rather than an error to raise: an install
   * restored without its artefacts has no such directory at all.
   */
  async take(): Promise<Census> {
    const open = await this.db.select({ id: cases.id }).from(cases)

    // Deduplicated once, here: two rows naming one artefact are one file, and
    // so are two cases holding the same one.
    const wanted = new Set<string>()
    for (const one of open) {
      const named = await withCase(this.db, one.id, (tx) =>
        tx.select({ hash: evidence.hash }).from(evidence).where(isNotNull(evidence.storedAt)),
      )
      // A row cannot be stored without the digest it is stored under; the
      // check is what narrows the column's type, not a second filter.
      for (const row of named) if (row.hash) wanted.add(row.hash)
    }
    if (wanted.size === 0) return { expected: 0, missing: 0 }

    const root = this.config.get('EVIDENCE_DIR', { infer: true })
    let held: Set<string>
    try {
      held = new Set(await readdir(root))
    } catch {
      held = new Set()
    }

    let missing = 0
    for (const hash of wanted) if (!held.has(hash)) missing += 1
    return { expected: wanted.size, missing }
  }
}
