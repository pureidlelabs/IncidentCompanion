/**
 * The pixel densities every visual tier renders at.
 *
 * **A tier at one density reports the others' defects clean.** A layout landing
 * on a fractional CSS pixel rounds to different device pixels at each ratio, so
 * a seam that shows a row through a sticky header at 2x does not exist at 1x --
 * measured on a scrollport at 176.883 CSS pixels, swept at 1x and reported
 * clean while it was plainly visible on a Retina screen.
 *
 * **The fractional ratios are the hard ones, and they are the common ones.**
 * Windows ships 125% and 150% display scaling, which arrive as 1.25 and 1.5;
 * macOS's 2 is the forgiving case because every CSS pixel maps to a whole
 * number of device pixels. A tier that tests 1 and 2 alone misses the ratios
 * most users are on.
 *
 * `VISUAL_DENSITIES=1,2` trims the set where a sweep's runtime matters more
 * than its coverage.
 */
export const DENSITIES: readonly number[] = (process.env.VISUAL_DENSITIES ?? '1,1.25,1.5,2')
  .split(',')
  .map((one) => Number(one.trim()))
  .filter((one) => Number.isFinite(one) && one > 0)

/** Those densities as Playwright projects, named for the scaling a person sets. */
export function densityProjects<T extends object>(use: T = {} as T) {
  return DENSITIES.map((deviceScaleFactor) => ({
    name: `${String(Math.round(deviceScaleFactor * 100))}%`,
    use: { ...use, deviceScaleFactor },
  }))
}
