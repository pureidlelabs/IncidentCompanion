/**
 * The first thing the browser tier has to be able to do.
 *
 * **Deliberately small, and it is the one that diagnoses.** It proves the tier
 * reaches a real server over its self-signed TLS, drives the SPA's own form and
 * lands on the picker. Every other spec here signs in first, so when the whole
 * directory goes red this is the spec that says whether the fault is the app or
 * the stack under it.
 */
import { expect, test } from '@playwright/test'

import { signIn } from './support/app.js'

test('an analyst signs in and lands on the picker', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('heading', { name: /your cases/i })).toBeVisible()
})

/**
 * **The sign-in screen is what an unauthenticated visitor gets**, whatever
 * path they typed - the SPA shell is public and draws the form, and the API
 * behind it is not.
 */
test('an unknown path still lands on the sign-in screen', async ({ page }) => {
  await page.goto('/nothing-here', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
})
