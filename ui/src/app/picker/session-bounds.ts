/**
 * The two windows a session is held to, as rows the Administration pane draws.
 */
import type { Bound } from '@/api/policy'
import { stepsWithin } from '@/api/policy'
import type { BoundRow } from '@/components/blocks/picker-rows'

const IDLE_STEPS = [5, 10, 15, 30, 45, 60, 120, 240, 480, 720] as const
const LIFETIME_STEPS = [30, 60, 120, 240, 480, 600, 720, 960, 1440] as const

/** The key each row writes, which the server states the bounds for. */
export const IDLE_KEY = 'auth.sessionIdleMinutes'
export const LIFETIME_KEY = 'auth.sessionLifetimeMinutes'

/** What the install answered for both keys, either of which may be absent. */
export interface SessionPolicy {
  idle: Bound | undefined
  lifetime: Bound | undefined
}

/**
 * Minutes as a person reads them: hours once they divide, minutes otherwise.
 */
export function inWords(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60
    return `${String(hours)} ${hours === 1 ? 'hour' : 'hours'}`
  }
  return `${String(minutes)} minutes`
}

function row(
  id: string,
  label: string,
  description: string,
  key: string,
  bound: Bound | undefined,
  steps: readonly number[],
  onSet: (key: string, value: number) => void,
): BoundRow | undefined {
  if (!bound) return undefined
  const values = stepsWithin(bound, steps).map(Number)
  const spelled = new Map(values.map((value) => [inWords(value), value]))
  return {
    id,
    label,
    description,
    choices: [...spelled.keys()],
    chosen: inWords(bound.value),
    onChoose: (choice: string) => {
      const value = spelled.get(choice)
      if (value !== undefined) onSet(key, value)
    },
  }
}

export function sessionBounds(
  policy: SessionPolicy,
  onSet: (key: string, value: number) => void,
): readonly BoundRow[] {
  return [
    row(
      'session-idle',
      'Sign out when idle for',
      'How long a session survives with nobody at the keyboard.',
      IDLE_KEY,
      policy.idle,
      IDLE_STEPS,
      onSet,
    ),
    row(
      'session-lifetime',
      'Sign out after',
      'How long a session lasts however busy it is.',
      LIFETIME_KEY,
      policy.lifetime,
      LIFETIME_STEPS,
      onSet,
    ),
  ].filter((one): one is BoundRow => one !== undefined)
}
