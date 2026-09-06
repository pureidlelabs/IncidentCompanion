/**
 * The probes still bite.
 *
 * **A spec rather than a command somebody remembers.** The trigger is a change
 * to the section action row's markup, which touches neither the probe nor the
 * harness, and nothing else catches it: the unit suites, the other specs and a
 * full sweep all stay green, because none of them runs the probes against a
 * page that is *meant* to be broken. As a spec it runs with the tier.
 *
 * It is quick relative to the sweeps beside it - one settle per fault.
 */
import { expect, test } from '@playwright/test'

import { requireServedApp, ensureAnalyst, ensureCase } from '../support/app.js'

import { selftest } from './selftest.js'

test.describe('the geometry probes', () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    await requireServedApp(baseURL ?? '')
    await ensureAnalyst(browser, baseURL ?? '')
    await ensureCase(browser, baseURL ?? '')
  })

  test('each one fires on a page broken the way it is meant to catch', async ({ browser }) => {
    test.setTimeout(180_000)
    const results = await selftest(browser)

    // The count is asserted first: a `FAULTS` list that silently shrank would
    // otherwise pass this file with every remaining fault firing.
    //
    // **Eleven faults over nine rules**, because two rules carry two each -
    // `small-target` has the plain button and the label-wrapped input its
    // exemption must not swallow, and `overlap` has the two toolbar buttons and
    // a control laid across a padded field's content, which the content-box
    // clamp must not forgive. The count alone lets a rule lose its only fault as
    // long as another gains one, so the *set of kinds* below is what holds every
    // rule covered.
    expect(results, 'eleven faults: two small-target, two overlap').toHaveLength(11)
    expect(
      new Set(results.map((one) => one.kind)),
      'every probe rule needs a fault: a rule with none is a rule nothing proves alive',
    ).toEqual(
      new Set([
        'h-scroll',
        'clipped-text',
        'overlap',
        'offscreen',
        'low-contrast',
        'small-target',
        'off-centre',
        'size-overridden',
        'paints-past-the-corner',
      ]),
    )

    const dead = results.filter((one) => !one.fired)
    expect(
      dead.map((one) => `${one.kind}: ${one.why}${one.error ? ` -- ${one.error}` : ''}`),
      'a probe that does not fire on its own fault reports nothing on a real page either. ' +
        'If the fault would not apply, the action row or rail markup moved: re-read the ' +
        'rendered page and re-aim it, do not delete it.',
    ).toEqual([])
  })
})
