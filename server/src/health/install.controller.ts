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

import { MAX_ATTACHMENT_BYTES } from '../evidence/store.js'
import { MAX_TOTAL_BYTES } from '../archive/format.js'
import { MIN_PASSPHRASE_CHARS } from '../archive/envelope.js'
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
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  @Get('settings')
  @ZodResponse({
    status: 200,
    type: InstallSettingsDto,
    description: 'How this install is configured. No value here is a secret.',
  })
  read(): InstallSettings {
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
      },
      limits: {
        attachmentBytes: MAX_ATTACHMENT_BYTES,
        archiveBytes: MAX_TOTAL_BYTES,
        passphraseChars: MIN_PASSPHRASE_CHARS,
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
