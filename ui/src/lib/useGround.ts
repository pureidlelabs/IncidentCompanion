import { useTheme } from 'next-themes'

import { THEME_OPTIONS, type Theme } from '@/lib/theme-preference'

/**
 * The chosen ground, from `next-themes`.
 *
 * **A wrapper rather than a re-export, for three reasons that are the whole of
 * what is left here.** `useTheme` hands back `string | undefined` for a value
 * this app has a closed type for; it is unresolved on the first render, and a
 * switcher that renders `undefined` as "no ground chosen" reads as a control
 * that lost the setting; and the language attribute below has no home in a
 * theme provider.
 *
 * The provider writes `data-theme`, holds the `matchMedia` listener for
 * `system`, persists the choice and carries its own blocking script, so none
 * of that is here.
 *
 * **The language axis is the document's and is not touched here.** `index.html`
 * declares it on `<html>`, Storybook's decorator declares it for a document
 * that has none, and nothing in the app writes it -
 * `languages.rule.test.ts` refuses a writer.
 *
 * `'system'` still re-resolves when the OS flips, which is what makes it a
 * preference rather than a third colour.
 */
export function useGround(): { theme: Theme; setTheme: (next: Theme) => void } {
  const { theme, setTheme } = useTheme()

  return {
    /**
     * **Validated against the list, not cast to it.**
     *
     * `useTheme` answers whatever is in `localStorage` under `ic-theme`, as a
     * `string`. Casting it to `Theme` tells the compiler it is one of three
     * and catches only `undefined` - the unresolved first render, which is the
     * case the `?? 'system'` was written for. Any *other* string walks through
     * and reaches `THEME_ICON[theme]`, which answers `undefined`, and React
     * renders `<undefined/>` and throws #130: the whole app becomes
     * `RootError`, on every route, and reloading does not clear it because the
     * cause is in storage.
     *
     * The read that used to defend against this was `storedTheme()`, and it
     * went when the storage moved to `next-themes`. Nothing a control can do
     * writes a fourth value today - but the *write* that could was
     * `storedWithLegacySeed`, which copied `sessionStorage` in without
     * validating, and was safe only because this read validated. Keeping the
     * read is what makes the pair safe rather than lucky.
     */
    theme: THEME_OPTIONS.some((option) => option.value === theme)
      ? (theme as Theme)
      : 'system',
    setTheme,
  }
}
