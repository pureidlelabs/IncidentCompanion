/**
 * Seeding, as a one-shot that exits - not as something every server does on boot.
 */
import 'reflect-metadata'

import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { loadEnv } from './config/env'
import { DemoReportSender } from './demo-reports/sender.service'
import { DemoSeederService } from './demos/seeder.service'
import { AuthService } from '@thallesp/nestjs-better-auth'

import type { Auth } from './auth/auth.config'
import { CustomersService } from './customers/customers.service'
import { LibraryService } from './library/library.service'
import { LanguageService } from './report/language.service'

async function seed(): Promise<void> {
  const env = loadEnv()
  const log = new Logger('Seed')

  // Refused here rather than at the first write: the message names the
  // variable, where a null database names a property on `undefined`.
  if (!env.SEED_DATABASE_URL) {
    throw new Error(
      'SEED_DATABASE_URL is not set, and seeding is the one thing that cannot ' +
        'run without it \u2014 it writes across every case, which row-level security ' +
        'refuses on the app role.',
    )
  }

  const wantsDemos = process.argv.includes('--demos')
  const wantsAccount = process.argv.includes('--dev-account')

  /**
   * **An application context, so nothing listens.**
   */
  const app = await NestFactory.createApplicationContext(AppModule)

  try {
    await app.get(LibraryService, { strict: false }).seedBuiltIns()
    log.log('Library built-ins written')

    // **Before the demos**, which open cases: a case created without a
    // customer to point at would carry none, and the install is required to
    // always hold the default.
    const fallback = await app.get(CustomersService, { strict: false }).ensureDefault()
    log.log(`Default customer: ${fallback.name}`)

    await app.get(LanguageService, { strict: false }).seedBuiltIn()
    log.log('Language pack written')

    if (wantsDemos) {
      const rebuilt = await app.get(DemoSeederService, { strict: false }).reseed()
      log.log(`Demo cases rebuilt: ${String(rebuilt)}`)
      await app.get(DemoReportSender, { strict: false }).fileDeclared()
    } else {
      log.log('Demo content skipped \u2014 pass --demos to rebuild it')
    }

    /**
     * **The dev loop's own analyst.**
     */
    if (wantsAccount) {
      const email = process.env['IC_DEV_EMAIL']
      const password = process.env['IC_DEV_PASSWORD']
      if (!email || !password) {
        log.warn('--dev-account needs IC_DEV_EMAIL and IC_DEV_PASSWORD; skipped')
      } else {
        try {
          // **Typed with this install's own `Auth`.** `AuthService`'s default
          // generic is a plugin-less instance, so `api` is `any` and every
          // call through it is unchecked -- the same reason
          // `accounts.controller.ts` names the generic.
          await app
            .get<AuthService<Auth>>(AuthService, { strict: false })
            .api.signUpEmail({ body: { email, password, name: 'Dev Analyst' } })
          log.log(`Dev account created: ${email}`)
        } catch {
          log.log('This install already has accounts \u2014 sign in, or ask an admin for one')
        }
      }
    }
  } finally {
    // Closes the pools. Without it the process holds its Postgres and Redis
    // connections open and the Job never completes.
    await app.close()
  }
}

seed().catch((error: unknown) => {
  new Logger('Seed').error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
