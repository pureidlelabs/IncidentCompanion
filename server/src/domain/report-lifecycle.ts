/**
 * Where a report goes after it has been sent.
 *
 * **A filed document is never edited, so the cascade is the only way forward.**
 * Article 23 already works this way - an early warning is superseded by a
 * notification, a notification by an intermediate report - which is why the
 * successor's stage is derived rather than asked for.
 */

/**
 * The stage that follows each one.
 *
 * **`NIS2 final` is deliberately absent.** A final report on an incident that
 * turns out not to be over is superseded by another final report, not by a
 * fifth stage that the regime does not have.
 */
const NEXT_STAGE: Record<string, string> = {
  'NIS2 early warning': 'NIS2 notification',
  'NIS2 notification': 'NIS2 intermediate',
  'NIS2 intermediate': 'NIS2 final',
}

/**
 * The stage a superseding report takes. Its own, if the cascade ends here.
 *
 * An unstaged report - most of them - stays unstaged: superseding an internal
 * document must not enrol it in a regulatory sequence it was never part of.
 */
export function successorStage(stage: string | null): string | null {
  if (!stage) return stage
  return NEXT_STAGE[stage] ?? stage
}
