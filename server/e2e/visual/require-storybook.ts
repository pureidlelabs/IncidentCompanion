import { test } from '@playwright/test'

import { mustRun } from '../../test/must-run.js'

import { STORYBOOK_URL } from './storybook-url.js'

/** Whether Storybook answers at this worktree's address with a story index. */
export async function storybookIsUp(): Promise<boolean> {
  try {
    const answer = await fetch(`${STORYBOOK_URL}/index.json`, {
      signal: AbortSignal.timeout(5_000),
    })
    return answer.ok
  } catch {
    return false
  }
}

/**
 * Skips when exploring and refuses when certifying.
 *
 * The same split `requireServedApp` makes, and for the same reason: a skip is
 * right for a developer with no Storybook, and on a run that claims to certify
 * it is a tier reporting success having opened nothing. -> #1035
 */
export async function requireStorybook(): Promise<void> {
  if (await storybookIsUp()) return
  const why = `no Storybook at ${STORYBOOK_URL} - run \`cd ui && npm run storybook\``
  if (mustRun()) throw new Error(why)
  test.skip(true, why)
}
