/** The kit tier drives Storybook and reaches no server, so it waits on neither. */
import type { FullConfig } from '@playwright/test'

import warmStorybook from '../visual/storybook-warm.js'

import { requiring } from './prerequisites.js'

const reachable = requiring('storybook')

export default async function kitPrerequisites(config: FullConfig): Promise<void> {
  await reachable(config)
  await warmStorybook()
}
