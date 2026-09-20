/** The kit tier drives Storybook and reaches no server, so it waits on neither. */
import warmStorybook from '../visual/storybook-warm.js'

import { requiring } from './prerequisites.js'

const reachable = requiring('storybook')

export default async function kitPrerequisites(): Promise<void> {
  await reachable()
  await warmStorybook()
}
