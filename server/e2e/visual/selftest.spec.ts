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
    // **Fourteen injections over ten rules**, because three rules carry two
    // faults each and `bleed-cut` carries a fault and a case it must stay
    // silent about -
    // `small-target` has the plain button and the label-wrapped input its
    // exemption must not swallow, and `overlap` has the two toolbar buttons and
    // a control laid across a padded field's content, which the content-box
    // clamp must not forgive, and `size-overridden` has the plain element and the
    // table cell its sub-pixel tolerance must not forgive. The count alone lets
    // a rule lose its only fault as long as another gains one, so the *set of
    // kinds* below is what holds every rule covered.
    expect(
      results,
      'fourteen: two small-target, two overlap, two size-overridden, and one bleed-cut that must not fire',
    ).toHaveLength(14)
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
        'bleed-cut',
      ]),
    )

    /**
     * **A name is a tag and its classes joined by dots**, so whitespace in one
     * means the class list was never split and the 48-character cut fell
     * mid-token. That is invisible in a passing run: the finding still names
     * an element, just not one a reader can search for. -> #1071
     */
    expect(
      [...new Set(results.flatMap((one) => one.named))].filter((one) => /\s/.test(one)),
      'a finding named its element with the raw class list rather than the first classes',
    ).toEqual([])

    const dead = results.filter((one) => !one.quiet && !one.fired)
    expect(
      dead.map((one) => `${one.kind}: ${one.why}${one.error ? ` -- ${one.error}` : ''}`),
      'a probe that does not fire on its own fault reports nothing on a real page either. ' +
        'If the fault would not apply, the action row or rail markup moved: re-read the ' +
        'rendered page and re-aim it, do not delete it.',
    ).toEqual([])

    /**
     * **The other half, which a list of faults alone cannot say.** Every entry
     * above proves a rule can fire; none of them proves it stays quiet. A rule
     * that reports a page which is correct is worse than one that reports
     * nothing, because its findings get read once and disbelieved after.
     */
    const noisy = results.filter((one) => one.quiet && one.fired)
    expect(
      noisy.map((one) => `${one.kind}: ${one.why}`),
      'the probe reported a page that is correct, so its findings cannot be trusted on one that is not',
    ).toEqual([])
  })
})
