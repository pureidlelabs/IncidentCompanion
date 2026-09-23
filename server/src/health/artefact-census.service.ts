/**
 * What this install expects beside it, and what it cannot find.
 *
 * Asks each case what its rows name and asks the store what that case holds.
 * -> `openspec/specs/state/design.md`
 */
import { Inject, Injectable } from '@nestjs/common'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { artefactsNamed } from '../db/artefacts-named.js'
import { EvidenceStore } from '../evidence/store.js'

/** What the install expects, and how much of it is not there. */
export interface Census {
  /** Artefacts the rows name, once per case holding one. */
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
    private readonly store: EvidenceStore,
  ) {}

  /** Count what the rows say each case holds against what the store holds for it. */
  async take(): Promise<Census> {
    let expected = 0
    let missing = 0
    for (const [caseId, { stored }] of await artefactsNamed(this.db)) {
      if (stored.size === 0) continue
      const held = await this.store.held(caseId)
      expected += stored.size
      for (const hash of stored) if (!held.has(hash)) missing += 1
    }
    return { expected, missing }
  }

}
