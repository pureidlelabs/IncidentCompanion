import { Autocomplete as AriaAutocomplete, type AutocompleteProps } from 'react-aria-components'

export type { AutocompleteProps }

/**
 * A field and a list that share one keyboard.
 *
 * Wrap a text field and a collection in this and the arrows, Home, End and
 * Enter drive the list while the caret stays in the field -- React Aria calls
 * it virtual focus, and it is the only way a list reachable by keyboard can sit
 * beside a box the caret must not leave. A `ListBox` on its own walks under the
 * arrows only while it holds focus, which a field beside it is holding.
 *
 * ```tsx
 * <Autocomplete inputValue={query} onInputChange={setQuery}>
 *   <SearchField aria-label="Search" />
 *   <ListBox aria-label="Results">{rows}</ListBox>
 * </Autocomplete>
 * ```
 *
 * **Pass `filter` only where the collection is unfiltered.** A caller that has
 * already ranked and cut its own rows -- against a case, or a server -- wants
 * them shown as given, and a second filter here drops rows the ranking chose.
 */
export function Autocomplete(props: AutocompleteProps) {
  return <AriaAutocomplete {...props} />
}
