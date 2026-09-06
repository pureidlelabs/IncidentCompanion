import { useMemo } from 'react'
import { useFilter, useLocale, type Filter } from 'react-aria-components'

export { useFilter, useLocale }
export type { Filter }

/**
 * Locale-aware `contains`, `startsWith` and `endsWith`, case- and accent-blind.
 *
 * The match a search box wants. `options` overrides the `sensitivity: 'base'`
 * default.
 */
export function useSearchFilter(options?: Intl.CollatorOptions): Filter {
  return useFilter({ sensitivity: 'base', ...options })
}

/**
 * An `Intl.Collator` for the current locale, memoised on `options`.
 *
 * `collator.compare` is the sort function a list of names wants; the default
 * string sort orders by code unit and puts every accented word after `Z`.
 */
export function useCollator(options?: Intl.CollatorOptions): Intl.Collator {
  const { locale } = useLocale()
  const key = JSON.stringify(options ?? {})
  return useMemo(
    () => new Intl.Collator(locale, options),
    // `key` stands in for `options`, which is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, key],
  )
}

export function useDateFormatter(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const { locale } = useLocale()
  const key = JSON.stringify(options ?? {})
  return useMemo(
    () => new Intl.DateTimeFormat(locale, options),
    // `key` stands in for `options`, which is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, key],
  )
}
