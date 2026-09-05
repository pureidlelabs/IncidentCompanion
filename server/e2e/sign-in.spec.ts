/**
 * The first thing the browser tier has to be able to do.
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
