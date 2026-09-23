/**
 * What this install expects beside it, what it cannot find, and what nothing
 * names any more.
 *
 * Asks each case what its rows name and asks the store what that case holds.
 * -> `openspec/specs/state/design.md`
 */
import { Inject, Injectable } from '@nestjs/common'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { artefactsNamed, casesDeleted, type Named } from './artefacts-named.js'
import { EvidenceStore } from '../evidence/store.js'

/** What the install expects, and how much of it is not there. */
export interface Census {
  /** Artefacts the rows name, once per case holding one. */
  expected: number
  /** How many of those the install cannot find. */
  missing: number
}

/**
 * How old unnamed bytes must be before the sweep removes them.
 *
 * **Bytes land before the row naming them commits**, an upload's for a moment
 * and an archive's for the whole import, so a file younger than this may be
 * about to be named.
 */
export const SWEEP_GRACE_MS = 60 * 60 * 1000

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
    private readonly store: EvidenceStore,
  ) {}

  /** What each case's rows name, for `take` and `sweep` to share one walk. */
  named(): Promise<Map<string, Named>> {
    return artefactsNamed(this.db)
  }

  /** Count what the rows say each case holds against what the store holds for it. */
  async take(named?: Map<string, Named>): Promise<Census> {
    let expected = 0
    let missing = 0
    for (const [caseId, { stored }] of named ?? (await this.named())) {
      if (stored.size === 0) continue
      const held = await this.store.held(caseId)
      expected += stored.size
      for (const hash of stored) if (!held.has(hash)) missing += 1
    }
    return { expected, missing }
  }

  /**
   * Remove the bytes no row and no sent report names, and every case's whose
   * deletion the install recorded. Answers how many files went.
   */
  async sweep(named: Map<string, Named>): Promise<number> {
    const kept = new Map([...named].map(([caseId, { kept }]) => [caseId, kept]))
    return this.store.prune(kept, await casesDeleted(this.db), SWEEP_GRACE_MS)
  }
}
