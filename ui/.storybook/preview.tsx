import { QueryClient } from '@tanstack/react-query'

import { StrictMode } from 'react'

import { AppProviders } from '../src/app/AppProviders'
import type { Decorator, Preview } from '@storybook/react-vite'
import { useEffect, useState, type ReactNode } from 'react'

import '../src/styles/index.css'

/**
 * Two toolbar axes, and they are the two the token layer is built around.
 *
 * They are set on `documentElement` rather than on a wrapper div because
 * Radix portals a dialog to `document.body` - a wrapper would leave every
 * portalled surface reading the default language while the page behind it
 * changed.
 */
function Grounds({
  theme,
  language,
  children,
}: {
  theme: string
  language: string
  children: ReactNode
}) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.language = language
    document.body.style.backgroundColor = 'var(--background)'
    document.body.style.color = 'var(--foreground)'
  }, [theme, language])

  return children
}

// A component rather than the hook inline: a decorator is a plain function,
// and React's rules-of-hooks has no way to know it is rendered like one.
const withGrounds: Decorator = (Story, context) => {
  const { theme, language } = context.globals as { theme: string; language: string }
  return (
    <Grounds theme={theme} language={language}>
      <Story />
    </Grounds>
  )
}

/**
 * A query client for every story, because a hook cannot be called conditionally.
 *
 * A screen that opens a dialog somewhere calls that dialog's mutation hook on
 * every render, so the client has to exist even on the stories that never open
 * it - and without one the story does not render at all, it throws. Six report
 * stories and three others were in that state, unnoticed, because nothing ran
 * them.
 *
 * **A fresh client per story**, held in state rather than made at module scope:
 * one client shared across stories carries the previous story's cache into the
 * next, which under the Vitest project means a test's result depends on what
 * ran before it. `retry: false` so a story wiring a failing fetch fails now
 * rather than three backoffs later.
 */
function QueryGround({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return (
    <AppProviders client={client} ground={false}>
      {children}
    </AppProviders>
  )
}

/**
 * **The app's own stack, not a second one beside it.** These decorators and
 * `main.tsx` had drifted -- Storybook configured Motion and the app did not,
 * the app mounted the toast region and Storybook did not -- so a story was
 * evidence about a runtime that never shipped.
 */
const withAppProviders: Decorator = (Story) => (
  // **`StrictMode`, because the app mounts in it.** Without it a story runs a
  // single mount where the app runs two, and a component whose mount-time
  // animation does not survive the second is green here and dead there --
  // measured on the popover, which painted at opacity 0 in the app and
  // animated correctly in every story.
  <StrictMode>
    <QueryGround>
      <Story />
    </QueryGround>
  </StrictMode>
)

/**
 * **`reducedMotion="user"` reads the OS setting**, so every animation in the kit
 * is disabled for somebody who asked for that without a single component
 * checking. Transform and layout animations stop; opacity is kept, because a
 * thing appearing with no transition at all reads as a glitch.
 */


const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Light or dark within the chosen language',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
    language: {
      description: 'Which design language is speaking. `console` is the default.',
      toolbar: {
        title: 'Language',
        icon: 'paintbrush',
        items: [
          { value: 'console', title: 'Console' },
          { value: 'stress', title: 'Stress' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light', language: 'console' },
  /**
   * **Every component gets a documentation page, generated.**
   *
   * `autodocs` builds one page per component from the stories already written:
   * each variant rendered live, plus a props table `react-docgen-typescript`
   * reads out of the exported prop interface and its JSDoc. So the source is
   * the documentation and the two cannot drift - which is the failure every
   * hand-written component gallery has.
   *
   * A component that should not have a page opts out with `tags: ['!autodocs']`
   * on its meta.
   */
  tags: ['autodocs'],
  // Outermost last: `withGrounds` sets the ground on `documentElement`, so it
  // has to be outside the tree that reads the tokens.
  decorators: [withAppProviders, withGrounds],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    /**
     * **The story's own source, not a snippet regenerated from its args.**
     *
     * `dynamic` -- the default -- serialises every arg back into JSX, and an
     * arg that is a component serialises as that component's source. A page
     * whose block takes an `icon` rendered lucide's minified factory
     * (`(0, import_react.createElement)(Icon, { ref, iconNode, ... })`) where
     * `icon={ShieldAlert}` belonged, on every story that passes one.
     *
     * `code` prints what the story actually wrote, which is the thing a reader
     * would copy.
     */
    docs: { source: { type: 'code' } },
    /**
     * **Parts, then what is built from them, then the tier being replaced.**
     * Alphabetical puts `Blocks` above `Components` and `Legacy` in the middle
     * of the work, which reads as peers rather than as a direction of travel.
     * `'*'` catches anything not yet filed.
     *
     * `Layouts` was a fourth group and is gone with the tier: a shell, a case
     * frame, an auth frame and a section are blocks, filed by form or -- where
     * they only mean something in this product -- by function.
     */
    options: {
      storySort: {
        // Alphabetical within every group except one: `Screens`' own children
        // are the rail's groups, and the rail is a workflow (collect, then
        // correlate, then report) rather than an alphabet. The nested array
        // orders those; anything past it -- `System`, `Auth`, `Anywhere`, and
        // `Entities` until it folds into `Collect` -- falls back to
        // alphabetical, same as every other unlisted group.
        method: 'alphabetical',
        order: [
          'Components',
          'Blocks',
          'Screens',
          ['Overview', 'Collect', 'Correlate', 'Report', 'Case'],
          '*',
          'Legacy',
        ],
      },
    },
    /**
     * **`'todo'`, and the size of the backlog is why.** At `'error'` axe fails
     * a large minority of the story tests, so the gate would be red on arrival
     * -- and a gate that is red on arrival is one somebody turns off. It
     * reports until the backlog is worked through, and `'error'` is what it
     * becomes. The count is in the commit that last measured it.
     *
     * `'todo'` still runs axe on every story: the findings are in the run, not
     * suppressed.
     */
    a11y: { test: 'todo' },
  },
}

/**
 * **A slot prop gets no control.**
 *
 * Storybook infers an object control for anything typed `ReactNode`, and the
 * panel then renders the whole React element: a masthead's `mark` printed its
 * SVG factory, every `_jsxDEV` call and every source line number, filling the
 * panel with something nobody can edit or read.
 *
 * Keyed on the inferred type rather than a list of prop names, because the
 * names drift -- `mark`, `corner`, `atmosphere`, `rail`, `toolbar`, `footer`
 * and `header` are all the same kind of prop and there will be more.
 */
export const argTypesEnhancers = [
  (context: { argTypes: Record<string, { type?: { name?: string }; table?: { type?: { summary?: string } }; control?: unknown }> }) => {
    for (const argType of Object.values(context.argTypes)) {
      const summary = argType.table?.type?.summary ?? ''
      if (/React(Node|Element)|JSX\.Element/.test(summary)) argType.control = false
    }
    return context.argTypes
  },
]

export default preview
