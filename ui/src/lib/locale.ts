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
