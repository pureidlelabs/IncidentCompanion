import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **What Storybook shows and what the app draws are the same file.**
 *
 * It cannot see a container that passes markup *into* a screen through a prop.
 * That is a real hole: a `ReactNode` handed down renders in the app and never
 * in a story unless the story passes the same thing. What closes it is the
 * story tier -- a screen whose slots are only ever filled by the app is a
 * screen the gallery is not really showing.
 */
const HERE = resolve(dirname(fileURLToPath(import.meta.url)))

const FILES = glob
  .sync(`${HERE}/**/*.tsx`)
  .filter((path) => !/\.(test|stories)\.tsx$/.test(path))

/** Prose may name what the code may not draw -- this file's own docstring does. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Tiers a container may draw from, by specifier prefix.
 */
const COMPOSABLE = ['@/screens/', '@/components/blocks/', '@/app/', '.']

/**
 * Slots the router fills, which draw nothing of their own.
 */
const ROUTER_SLOTS: Readonly<Record<string, string>> = {
  Outlet: 'the router resolves the child route and draws it here',
  Navigate: 'a redirect, which renders nothing',
}

/**
 * The crossings that are decisions rather than drift, keyed `file: Name`.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'AppProviders.tsx: QueryClientProvider': 'context; it draws its children and nothing else',
  'AppProviders.tsx: MotionConfig': 'context; it draws its children and nothing else',
  'AppProviders.tsx: ThemeProvider': 'context; it draws its children and nothing else',
  'AppProviders.tsx: ToastRegion':
    'the toast outlet, which belongs above every screen and inside no one of them',
  'aria-routing.tsx: AriaRouter': "the kit's router adapter; it teaches navigation and draws children",
  'RootError.tsx: div': 'the last boundary renders without the kit, because the kit is what threw',
  'RootError.tsx: h1': 'the last boundary renders without the kit, because the kit is what threw',
  'RootError.tsx: p': 'the last boundary renders without the kit, because the kit is what threw',
  'RootError.tsx: button': 'the last boundary renders without the kit, because the kit is what threw',
  'RootError.tsx: pre': 'the last boundary renders without the kit, because the kit is what threw',
}

/**
 * Names this file declares itself.
 */
function definedLocally(text: string): string[] {
  return [
    ...text.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/g),
  ].map((one) => one[1] ?? '')
}

/** Every name a file imports from the tiers it may compose. */
function composableNames(text: string): string[] {
  const out: string[] = []
  for (const one of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
    const spec = one[2] ?? ''
    if (!COMPOSABLE.some((prefix) => spec.startsWith(prefix))) continue
    for (const raw of (one[1] ?? '').split(',')) {
      // `type X`, and `X as Y` - the drawn name is the last word either way.
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim() ?? ''
      if (name.length > 0) out.push(name)
    }
  }
  return out
}

/**
 * Every JSX element this file opens, by name -- **host elements included.**
 */
function elementsDrawn(text: string): string[] {
  // `(?<![\w>])` keeps a type parameter out: `useState<string | undefined>`
  // opens with a `<` preceded by a word character, where JSX never does -- it
  // follows a space, a bracket, a brace, or the `>` of the tag before it.
  const opens = /(?<![\w])<([A-Za-z][\w.-]*)/g
  return [...withoutComments(text).matchAll(opens)].map((one) => one[1] ?? '')
}

interface Container {
  file: string
  composable: string[]
  extra: string[]
}

/**
 * **Every file under `app/`, rather than only those importing a screen.**
 */
const CONTAINERS: Container[] = FILES.map((path) => {
  const text = readFileSync(path, 'utf8')
  const file = relative(HERE, path).replaceAll('\\', '/')
  const composable = [...composableNames(text), ...definedLocally(text)]
  const extra = [...new Set(elementsDrawn(text))].filter((one) => {
    // `Ctx.Provider` is drawn off a local `const Ctx`, so the root is what
    // decides it.
    const root = one.split('.')[0] ?? one
    if (composable.includes(one) || composable.includes(root)) return false
    if (ROUTER_SLOTS[one] !== undefined) return false
    return ALLOWED[`${file}: ${one}`] === undefined
  })
  return { file, composable, extra }
})

describe('a container binds a screen and draws nothing', () => {
  it('finds the containers', () => {
    expect(CONTAINERS.length).toBeGreaterThan(2)
  })

  /**
   * Markup in a container is markup the gallery never shows, so the two
   * diverge while both look correct on their own.
   */
  it('draws no element the screen does not', () => {
    const drawing = CONTAINERS.filter((one) => one.extra.length > 0)
      .map((one) => `${one.file}: ${one.extra.join(', ')}`)
      .sort()
    expect(
      drawing,
      'a container may hold state and bind callbacks, and may not draw. What ' +
        'it draws, Storybook cannot show -- so the screen an analyst sees and ' +
        'the screen the maintainer judged stop being the same thing. Move the ' +
        'markup into the screen and pass it what it needs.',
    ).toEqual([])
  })
})
