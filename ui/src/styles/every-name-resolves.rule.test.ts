/**
 * Every name this interface reads is a name something publishes.
 *
 * **Two spellings, one failure: CSS resolves an unknown name to silence.** A
 * `className` naming a utility Tailwind cannot generate compiles, ships and
 * paints nothing; a `var(--x)` with no fallback makes its whole declaration
 * invalid, so the property is dropped rather than defaulted. Neither raises a
 * warning, neither fails a build, and jsdom has no CSS at all -- so no other
 * tier in this project can see either one.
 *
 * `tokens.test.ts` guards the layer from the other end: that every token
 * declared is reachable, and that the vendored tier's `-foreground` spellings
 * still resolve. This is the general form of the same defect, read from the
 * call site rather than from the token file. Its arbitrary-radius rule passes
 * `rounded-[calc(var(--radius)-3px)]` because the bracket contains a `var()` --
 * it is testing that a component reads the scale, and cannot tell a token that
 * exists from one that does not -- so a `--radius` read everywhere and declared
 * nowhere, or a `text-severity-medium-ink` asked for and published never, both
 * pass it.
 *
 * **A fixed exclusion list, not an inherited one.** Nothing here is
 * exempted for having been wrong first: the only names allowed through are set
 * by a library at runtime or come from Tailwind's own theme, and each is a
 * fact about who writes it rather than a debt.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const INDEX = readFileSync(join(SRC, 'styles', 'index.css'), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(tsx?|css)$/.test(name) ? [path] : []
  })
}

/**
 * A file's code, with comments removed.
 *
 * A comment naming a token reads exactly like a use of one, and both halves of
 * this check are about what ships. `tokens.test.ts` carries the measurement:
 * one token in the whole tree was alive on prose alone.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const SOURCE = sourceFiles(SRC)
  // This file and `tokens.test.ts` only: both carry the offending spellings as
  // fixtures, and every other test file is scanned like any other source.
  .filter(
    (path) =>
      !path.endsWith('every-name-resolves.rule.test.ts') && !path.endsWith('tokens.test.ts'),
  )
  .map((path) => ({ path, text: code(readFileSync(path, 'utf8')) }))

/**
 * Every custom property this tree declares, by any of the four spellings it
 * uses: a CSS declaration, Tailwind's arbitrary-property class
 * (`[--auth-pane-w:30rem]`), an inline style object's key, and
 * `style.setProperty`.
 */
function declaredProperties(): Set<string> {
  const names = new Set<string>()
  for (const { path, text } of SOURCE) {
    if (path.endsWith('.css')) {
      for (const m of text.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) names.add(m[1]!)
    }
    for (const m of text.matchAll(/\[(--[a-z0-9-]+):/g)) names.add(m[1]!)
    for (const m of text.matchAll(/['"`](--[a-z0-9-]+)['"`]\s*[:,]/g)) names.add(m[1]!)
    for (const m of text.matchAll(/(?:set|remove)Property\(\s*['"`](--[a-z0-9-]+)/g)) {
      names.add(m[1]!)
    }
  }
  return names
}

/**
 * Names a library writes onto the element at runtime, so no source file
 * declares them and none can.
 *
 * React Aria measures a trigger's width and a tree row's depth. A name here is
 * a claim about who sets it, which is checkable by reading that library -- it
 * is not a list of things this project got wrong.
 */
const SET_BY_A_LIBRARY = new Set([
  '--tree-item-level',
  '--trigger-width',
])

/**
 * Tailwind's own theme, which this project republishes only part of.
 *
 * `@theme inline` names `--radius-xs` through `--radius-lg` and `--radius-full`;
 * the wider stops stay Tailwind's, and nothing here reaches for one.
 */
const TAILWIND_THEME = new Set<string>([])

/**
 * Every `var(--x)` and `utility-(--x)` read with **no fallback**, paired with
 * the file reading it.
 *
 * **The fallback is the whole discriminator.** `var(--rp-ink, var(--ink))` is
 * the library editor's override with the page's own token behind it, and the
 * name being unset is the normal case rather than the defect.
 *
 * A name built from an expression -- `var(--presence-${n})`, `--col-${id}-size`
 * -- is skipped: the text carries a prefix rather than a name, and the values
 * behind it are declared or set elsewhere.
 */
function unresolvedReads(): { name: string; path: string }[] {
  const declared = declaredProperties()
  const known = (name: string) =>
    declared.has(name) || SET_BY_A_LIBRARY.has(name) || TAILWIND_THEME.has(name)
  const found: { name: string; path: string }[] = []
  for (const { path, text } of SOURCE) {
    const reads = [
      ...text.matchAll(/var\((--[a-z0-9-]+)(\$\{)?\s*([,)])?/g),
      ...text.matchAll(/[a-z-]+-\((--[a-z0-9-]+)(\$\{)?([,)])/g),
    ]
    for (const m of reads) {
      if (m[2] !== undefined || m[3] === ',') continue
      if (!known(m[1]!)) found.push({ name: m[1]!, path })
    }
  }
  return found
}

/** Every colour role `@theme inline` publishes, so every `bg-`/`text-` that can exist. */
function publishedRoles(): Set<string> {
  const block = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(INDEX)
  if (!block) throw new Error('index.css has no `@theme inline` block')
  return new Set([...block[1]!.matchAll(/^\s*--color-([a-z0-9-]+):/gm)].map((m) => m[1]!))
}

/**
 * Every colour utility whose name belongs to a published role *family* and is
 * not itself published.
 *
 * **The family is what makes this decidable.** A colour utility and a size
 * utility are the same shape -- `text-severity-medium-ink` and `text-2xs` are
 * both `text-` and a word -- so nothing in the class alone says which one it
 * is. Keying on the first segment of a published role (`severity`, `ink`,
 * `sidebar`, `paper`) reads only the names this project's own language claims,
 * and leaves Tailwind's scales and its stock palette alone.
 *
 * **The gap, stated rather than found later:** a misspelling in the *first*
 * segment (`text-inkk-muted`) names no family and is invisible here. The
 * defect this was written for is the opposite shape -- a real family, a level
 * that exists, and a suffix nothing publishes.
 */
function unpublishedRoleClasses(text: string, roles: Set<string>): string[] {
  const families = new Set([...roles].map((role) => role.split('-')[0]!))
  const utility =
    'text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|caret|accent|placeholder|divide|shadow'
  return [
    ...text.matchAll(
      new RegExp(`(?<![a-zA-Z0-9_-])(?:${utility})-([a-z][a-z0-9-]*)(?![a-zA-Z0-9_-])`, 'g'),
    ),
  ]
    .filter((m) => families.has(m[1]!.split('-')[0]!) && !roles.has(m[1]!))
    .map((m) => m[0])
}

describe('every name the interface reads resolves', () => {
  it('reads the whole tree, which is what a wrong root would empty', () => {
    for (const dir of ['components', 'screens', 'app', 'styles', 'lib']) {
      expect(
        SOURCE.some(({ path }) => path.includes(`${sep}${dir}${sep}`)),
        dir,
      ).toBe(true)
    }
    expect(declaredProperties().size).toBeGreaterThan(100)
    expect(publishedRoles().size).toBeGreaterThan(30)
  })

  it('catches a var() nothing declares, and lets a fallback through', () => {
    // Fixtures rather than a live read: once the tree is clean nothing else
    // here proves the predicate still fires.
    const declared = declaredProperties()
    expect(declared.has('--severity-critical-type')).toBe(true)
    expect(declared.has('--auth-pane-w')).toBe(true)
    expect(declared.has('--never-declared-anywhere')).toBe(false)
  })

  it('declares every custom property it reads without a fallback', () => {
    expect(
      unresolvedReads().map(({ name, path }) => `${path.replace(SRC, '')}: ${name}`).sort(),
    ).toEqual([])
  })

  it('catches a role class the theme does not publish', () => {
    const roles = publishedRoles()
    expect(unpublishedRoleClasses('text-severity-medium-ink', roles)).toEqual([
      'text-severity-medium-ink',
    ])
    expect(unpublishedRoleClasses('bg-sidebar-nothing', roles)).toEqual(['bg-sidebar-nothing'])
    // Published roles, Tailwind's own scales, and its stock palette all pass.
    expect(unpublishedRoleClasses('text-severity-medium bg-muted/50 border-input', roles)).toEqual(
      [],
    )
    expect(unpublishedRoleClasses('text-2xs text-sm border-b border-transparent', roles)).toEqual(
      [],
    )
  })

  it('names only colour roles the theme publishes', () => {
    const roles = publishedRoles()
    const offenders = SOURCE.flatMap(({ path, text }) =>
      [...new Set(unpublishedRoleClasses(text, roles))].map(
        (cls) => `${path.replace(SRC, '')}: ${cls}`,
      ),
    ).sort()
    expect(offenders).toEqual([])
  })

  it('keeps both exclusion lists live, so neither can rot into an excuse', () => {
    // A name nothing reads any more is an exemption covering nothing, and the
    // next reader trusts it. Both lists may only shrink.
    const read = new Set(
      SOURCE.flatMap(({ text }) => [
        ...[...text.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!),
        ...[...text.matchAll(/[a-z-]+-\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!),
      ]),
    )
    expect([...SET_BY_A_LIBRARY].filter((name) => !read.has(name)).sort()).toEqual([])
    expect([...TAILWIND_THEME].filter((name) => !read.has(name)).sort()).toEqual([])
  })
})
