import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'
import { beforeEach, describe, expect, it } from 'vitest'

import { mockMatchMedia } from '@/test/matchMedia'

import { useGround } from './useGround'
import { THEME_KEY, THEME_PROVIDER } from './theme-preference'

/**
 * **A ground this app does not have must not take the app down.**
 *
 * `useTheme` answers whatever is under `ic-theme` in `localStorage`, typed
 * `string`. Casting that to `Theme` catches only `undefined`; any other value
 * reaches `THEME_ICON[theme]`, answers `undefined`, and React throws #130 -
 * so every route renders the error boundary, and a reload does not clear it
 * because the cause is in storage. The analyst has to clear site data.
 *
 * This is the test that went with `storedTheme()` when the storage moved to
 * `next-themes`: the whole of that function was this clause. Nothing a control
 * can do writes a fourth value today, and the point is that the *read* is what
 * made that safe rather than luck - the write path that used to copy
 * `sessionStorage` in did not validate at all.
 */
function Ground() {
  const { theme } = useGround()
  return <span data-testid="ground">{theme}</span>
}

function mount() {
  return render(
    <ThemeProvider {...THEME_PROVIDER}>
      <Ground />
    </ThemeProvider>,
  )
}

describe('the ground falls back rather than crashing', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
    mockMatchMedia(false)
  })

  it.each(['midnight', '', 'undefined', 'Dark', 'null'])(
    'answers `system` for the stored value %o',
    (stored) => {
      window.localStorage.setItem(THEME_KEY, stored)
      mount()
      expect(screen.getByTestId('ground')).toHaveTextContent('system')
    },
  )

  it.each(['light', 'dark', 'system'])('keeps the ground %o, which is a real one', (stored) => {
    window.localStorage.setItem(THEME_KEY, stored)
    mount()
    expect(screen.getByTestId('ground')).toHaveTextContent(stored)
  })
})
