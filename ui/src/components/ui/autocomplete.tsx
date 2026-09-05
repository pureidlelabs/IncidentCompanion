import { Autocomplete as AriaAutocomplete, type AutocompleteProps } from 'react-aria-components'

export type { AutocompleteProps }

/**
 * A field and a list that share one keyboard.
 */
export function Autocomplete(props: AutocompleteProps) {
  return <AriaAutocomplete {...props} />
}
