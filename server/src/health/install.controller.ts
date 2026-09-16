/**
 * `GET /api/settings` - how this install is running. Read-only: what an
 * analyst may change lives at `/api/preferences` and `/api/regimes`, and the
 * rest is deployment, which comes from the environment.
 *
 * **Every field is derived - a host, a database name, a scheme, a count - and
 * never a configured URL.** `DATABASE_URL` and `REDIS_URL` carry credentials
 * and `AUTH_SECRET` sits in the same object.
 */
import { Controller, Get, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { z } from 'zod'
import { ZodResponse, createZodDto } from 'nestjs-zod'

import { PolicyService } from '../policy/policy.service.js'
import { ArtefactCensus } from './artefact-census.service.js'
import type { Env } from '../config/env.js'

/**
 * A connection string with everything but where it points removed.
 *
 * **Rebuilt from parts rather than pattern-substituted.** A regex over the URL
 * leaves whatever it failed to match, and what it fails to match is the case
 * nobody thought of - a password containing an `@`, a query string carrying
 * `sslpassword`. Naming the three fields that may travel means a fourth cannot
 * arrive by accident.
 */
export function whereItPoints(url: string): string {
  try {
    const parsed = new URL(url)
    const database = parsed.pathname.replace(/^\//, '')
    return `${parsed.protocol}//${parsed.host}${database ? `/${database}` : ''}`
  } catch {
    // An unparseable value is not evidence it is safe to show.
    return 'not readable'
  }
}

/**
 * **The schema is the source; the type is inferred from it.** The API
 * reference publishes this by name, and a hand-kept interface beside it is the
 * copy that ends up describing a field the route stopped serving.
 */
export const installSettingsSchema = z.object({
  transport: z.object({
    scheme: z.literal('https'),
    port: z.number().int(),
    note: z.string(),
  }),
  storage: z.object({
    /** Where it points, with the credential removed - see `whereItPoints`. */
    database: z.string(),
    redis: z.string(),
    evidence: z.string(),
    /**
     * **What this install does and does not do to an attached artefact.** The
     * store holds the thing that attacked somebody, and it is deliberately
     * unreadable to the analyst's own endpoint protection - that is a fact they
     * are owed in the open rather than left to discover.
     */
    evidenceNote: z.string(),
    /**
     * **What nothing here does to durable state, and whose job it therefore
     * is.** The application does not encrypt what it stores: a key it managed
     * would sit in front of storage the operator already protects, and
     * recovery would depend on that key surviving. Saying so is what it owes
     * in exchange, and an operator who has not encrypted the storage beneath
     * should learn it here rather than from an auditor.
     */
    encryptionNote: z.string(),
    /**
     * How many artefacts this install holds the bytes of, and how many of
     * those it cannot find beside it.
     */
    artefacts: z.object({
      expected: z.number().int(),
      missing: z.number().int(),
    }),
  }),
  limits: z.object({
    attachmentBytes: z.number().int(),
    archiveBytes: z.number().int(),
    passphraseChars: z.number().int(),
  }),
  /** Where the writable settings actually live, so the pane can point at them. */
  elsewhere: z.array(z.object({ label: z.string(), where: z.string() })),
})

export type InstallSettings = z.infer<typeof installSettingsSchema>

export class InstallSettingsDto extends createZodDto(installSettingsSchema) {}

@Controller('api')
export class InstallSettingsController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    private readonly policy: PolicyService,
    private readonly census: ArtefactCensus,
  ) {}

  @Get('settings')
  @ZodResponse({
    status: 200,
    type: InstallSettingsDto,
    description: 'How this install is configured. No value here is a secret.',
  })
  async read(): Promise<InstallSettings> {
    const stored = await this.policy.read()
    const artefacts = await this.census.take()
    return {
      transport: {
        // **Not read from the environment.** There is no plaintext port, no
        // `--no-tls` and no test bypass; stating it as a fact rather than a
        // setting is the honest rendering of a thing that cannot vary.
        scheme: 'https',
        port: this.config.get('PORT', { infer: true }),
        note: 'Loopback only, over TLS. There is no plaintext port.',
      },
      storage: {
        database: whereItPoints(this.config.get('DATABASE_URL', { infer: true })),
        redis: whereItPoints(this.config.get('REDIS_URL', { infer: true })),
        evidence: this.config.get('EVIDENCE_DIR', { infer: true }) ?? '.evidence',
        // **Says both halves, because either alone misleads.** "Sealed" without
        // "not scanned" reads as protection; "not scanned" without "sealed"
        // leaves an analyst expecting their AV to cover it.
        evidenceNote:
          'Attachments are stored in individual zips under the password "infected", ' +
          'so antivirus cannot quarantine your evidence. This app does not scan them, ' +
          'and your endpoint protection cannot see inside them.',
        // **Says whose job it is, not only that it is undone.** "Stored
        // unencrypted" alone reads as a defect somebody should fix here; what
        // makes it a division of responsibility is the second half. Evidence
        // is named because it is the most sensitive thing this holds and the
        // one an operator is likeliest to assume is treated differently.
        encryptionNote:
          'The database, the cache and the evidence store are written unencrypted by this ' +
          'application. Confidentiality at rest is whatever the storage underneath provides -- ' +
          'your disks, your volumes, your platform. This app holds no key of its own, so ' +
          'encrypting that storage is yours to do and yours to verify.',
        artefacts,
      },
      /**
       * **What the install enforces, not what it shipped with.** These were
       * the compile-time constants, so the screen agreed with the code and
       * both disagreed with the setting an operator had changed. -> #588
       */
      limits: {
        attachmentBytes: stored['evidence.attachmentMegabytes'] * 1024 * 1024,
        archiveBytes: stored['evidence.archiveMegabytes'] * 1024 * 1024,
        passphraseChars: stored['evidence.passphraseChars'],
      },
      // **Named rather than duplicated.** A read-only copy of a switch that is
      // writable elsewhere is a second answer that can disagree with the first.
      elsewhere: [
        { label: 'Theme and avatar', where: 'Your account' },
        { label: 'Compliance regimes and the GDPR floors', where: 'Compliance' },
        { label: 'Accounts and roles', where: 'Accounts' },
      ],
    }
  }
}
