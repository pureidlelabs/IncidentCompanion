/**
 * What `GET /api/settings` may say about this install.
 *
 * **Every case here is an attempt to get a secret out of it.** The route reads
 * the same object that holds `DATABASE_URL`, `REDIS_URL` and `AUTH_SECRET`, so
 * the only way it can be badly wrong is by echoing one - and a password
 * reaches the browser looking exactly like a hostname until somebody reads it.
 */
import { describe, expect, it } from 'vitest'

import { InstallSettingsController, whereItPoints } from './install.controller.js'
import { defaultPolicy } from '../policy/read.js'

/**
 * The install's bounds, as the doors read them.
 *
 * **A stub, because these cases are not about the bounds.** Every door reads
 * them per act now, so a fixture that cannot answer fails to compile rather
 * than falling back to a constant -- which is the state #588 was about.
 */
const POLICY_DEFAULTS = defaultPolicy()
const policy = { read: () => Promise.resolve(POLICY_DEFAULTS) } as never

/** A config holding the shapes a real deployment has. */
function configOf(over: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    PORT: 8443,
    DATABASE_URL: 'postgres://ic_app:s3cr3t-passw0rd@db.internal:5432/incidentcompanion',
    REDIS_URL: 'redis://:another-secret@cache.internal:6379',
    EVIDENCE_DIR: '/var/lib/incidentcompanion/evidence',
    AUTH_SECRET: 'an-auth-secret-that-must-never-travel',
    ...over,
  }
  return { get: (key: string) => values[key] } as never
}

/**
 * The census, stubbed: what it counts is `artefact-census.service.ts`'s own
 * case, and what this file asks is whether the description carries it.
 */
const censusOf = (held = { expected: 0, missing: 0 }) =>
  ({ take: () => Promise.resolve(held) }) as never

const settingsOf = (over?: Record<string, unknown>, held?: { expected: number; missing: number }) =>
  new InstallSettingsController(configOf(over), policy, censusOf(held)).read()

describe('redacting a connection string', () => {
  it('keeps where it points and drops the credential', () => {
    expect(whereItPoints('postgres://ic_app:s3cr3t@db.internal:5432/incidentcompanion')).toBe(
      'postgres://db.internal:5432/incidentcompanion',
    )
  })

  it('drops a password containing an @, which a regex would leave behind', () => {
    // The case that defeats pattern substitution: the naive "everything up to
    // the last @" is right and "up to the first @" leaks the rest of it.
    const out = whereItPoints('postgres://user:p@ss@w0rd@db.internal:5432/ic')
    expect(out).not.toContain('p@ss')
    expect(out).not.toContain('w0rd')
  })

  it('drops a query string, which can carry a key of its own', () => {
    const out = whereItPoints('postgres://u:p@db:5432/ic?sslpassword=hunter2&sslmode=require')
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('sslpassword')
  })

  it('says nothing rather than guessing when the value will not parse', async () => {
    expect(whereItPoints('this is not a url with a secret in it')).toBe('not readable')
  })
})

describe('the install settings document', () => {
  it('carries no credential from any connection string', async () => {
    const flat = JSON.stringify(await settingsOf())
    for (const secret of [
      's3cr3t-passw0rd',
      'another-secret',
      'an-auth-secret-that-must-never-travel',
      'ic_app',
    ]) {
      expect(flat).not.toContain(secret)
    }
  })

  it('still says where the database and cache are', async () => {
    // Redacting to nothing would make the pane useless: an operator reads this
    // to know which stack they are looking at.
    const settings = await settingsOf()
    expect(settings.storage.database).toContain('db.internal')
    expect(settings.storage.redis).toContain('cache.internal')
  })

  it('states the transport as a fact, not as a setting', async () => {
    // There is no plaintext port, no --no-tls and no bypass. Offering a scheme
    // would describe a choice this app does not have.
    const settings = await settingsOf()
    expect(settings.transport.scheme).toBe('https')
    expect(settings.transport.port).toBe(8443)
  })

  it('offers nothing that looks like a control', async () => {
    // The pane states; it does not edit. A field named like an option - an
    // `enabled`, a list of choices - is how a read-only surface grows a form.
    const flat = JSON.stringify(await settingsOf())
    for (const shape of ['Options', 'enabled', 'locked', 'mode']) {
      expect(flat).not.toContain(shape)
    }
  })

  it('names where the writable settings live rather than copying them', async () => {
    // A read-only copy of a switch that is writable elsewhere is a second
    // answer that can disagree with the first.
    const settings = await settingsOf()
    expect(settings.elsewhere.map((one) => one.where)).toContain('Compliance')
  })

  it('reports the caps a refusal will quote at the analyst', async () => {
    const settings = await settingsOf()
    expect(settings.limits.attachmentBytes).toBeGreaterThan(0)
    expect(settings.limits.archiveBytes).toBeGreaterThan(0)
    expect(settings.limits.passphraseChars).toBeGreaterThan(0)
  })

  // The answer for an unset directory is asserted in `config/env.test.ts`.
  it('names the directory the environment gave it', async () => {
    expect((await settingsOf()).storage.evidence).toBe('/var/lib/incidentcompanion/evidence')
  })

  /**
   * **The half a log line cannot answer.** *So that a restore can say what is
   * missing* is a question an operator comes back to once the restore is
   * finished, by which time the boot line has scrolled away -- and the same
   * field is what says whole again when the artefacts are put back. -> #179
   */
  it('says how many artefacts it expects and how many it cannot find', async () => {
    const storage = (await settingsOf(undefined, { expected: 12, missing: 3 })).storage

    expect(storage.artefacts.expected, 'the description does not say what it expects').toBe(12)
    expect(storage.artefacts.missing, 'an install short of its evidence reports none gone').toBe(3)
  })

  /**
   * **Both numbers, so the case is not answered by the one above it.** An
   * assertion on `missing` alone passes against a field pinned to zeroes,
   * which is exactly the mistake the other case catches -- two tests failing
   * only together are one test.
   */
  it('still says what it expects on an install that holds them all', async () => {
    const storage = (await settingsOf(undefined, { expected: 12, missing: 0 })).storage

    expect(storage.artefacts).toEqual({ expected: 12, missing: 0 })
  })
})

describe('what the install says about the wrapping', () => {
  /**
   * **The password is published, which is the statement.** `state` requires
   * that the wrapping's password *is not a secret and MUST NOT be treated as
   * one*, and the strongest way an install can say that is to print it in its
   * own description rather than describe it as protected.
   *
   * So this asserts the note names it. A note that said "attachments are
   * sealed" and withheld the word would leave an operator to assume the seal
   * is a lock, which is the reading the requirement exists to prevent.
   */
  it('names the password rather than describing the artefacts as protected', async () => {
    const note = (await settingsOf()).storage.evidenceNote

    expect(note, 'the note does not name the password, so a reader may take it for a secret').toMatch(
      /infected/i,
    )
  })

  /**
   * **The one thing an operator must not learn from an auditor.**
   *
   * Why nothing is encrypted here is on the field itself. -> #177
   *
   * **Three properties rather than the sentence**, as the notes beside it are
   * asserted: rewording is free, and dropping any of the three is not.
   */
  it('says the state it keeps is unencrypted, and what confidentiality rests on', async () => {
    const note = (await settingsOf()).storage.encryptionNote

    expect(note, 'the note does not say the application leaves it unencrypted').toMatch(
      /unencrypted|does not encrypt/i,
    )
    expect(note, 'the note does not say what confidentiality rests on instead').toMatch(
      /storage|disk|volume|platform/i,
    )
    expect(note, 'the note leaves an operator to guess whether evidence is included').toMatch(
      /evidence|artefact/i,
    )
  })

  /**
   * **Both halves, because either alone misleads.** The controller's own
   * comment says so: *sealed* without *not scanned* reads as protection, and
   * *not scanned* without *sealed* leaves an analyst expecting their antivirus
   * to cover it.
   *
   * Asserted as two properties rather than as the sentence, so rewording the
   * note is free and dropping half of it is not.
   */
  it('says both why it is wrapped and what that costs', async () => {
    const note = (await settingsOf()).storage.evidenceNote

    expect(note, 'the note does not say the wrapping stops quarantine').toMatch(
      /quarantine|antivirus/i,
    )
    expect(note, 'the note does not say nothing scans the contents').toMatch(/does not scan|cannot see/i)
  })
})
