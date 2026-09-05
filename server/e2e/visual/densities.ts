/**
 * The pixel densities every visual tier renders at.
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
