/**
 * Where a report goes after it has been sent.
 */

/**
 * The stage that follows each one.
 */
const NEXT_STAGE: Record<string, string> = {
  'NIS2 early warning': 'NIS2 notification',
  'NIS2 notification': 'NIS2 intermediate',
  'NIS2 intermediate': 'NIS2 final',
}

/**
 * The stage a superseding report takes. Its own, if the cascade ends here.
 */
export function successorStage(stage: string | null): string | null {
  if (!stage) return stage
  return NEXT_STAGE[stage] ?? stage
}
