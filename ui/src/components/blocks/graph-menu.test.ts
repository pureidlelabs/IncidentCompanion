/**
 * What the incident graph's right-click offers.
 *
 * **Asserted on the builder, not through the screen.** The canvas is Cytoscape
 * over `<canvas>`: jsdom draws no node, so there is nothing to right-click and
 * a component test would open no menu at all - it would pass whatever the menu
 * said. What no test here can see is that the right-click *lands* on the node
 * the analyst aimed at; that is `aimMenu`'s proximity search.
 */

import { describe, expect, it, vi } from 'vitest'

import { buildGraphMenu, type GraphMenuContext } from './graph-menu'
import type { IncidentNode } from './incident-graph'

function node(over: Partial<IncidentNode> = {}): IncidentNode {
  return {
    id: 'n1',
    kind: 'account',
    label: 'p.zero@meridian.example',
    members: ['p.zero@meridian.example'],
    count: 1,
    paintedBy: null,
    severity: '',
    seen: 0,
    bridge: false,
    spans: 1,
    entry: false,
    entityId: 'acc-1',
    unnarrated: false,
    groupKey: 'account|phish',
    unfolded: false,
    ...over,
  }
}

function context(over: Partial<GraphMenuContext> = {}): GraphMenuContext {
  return {
    expanded: new Set(),
    hidden: new Set(),
    screenFor: new Map([['account', { slug: 'accounts', title: 'Accounts' }]]),
    toggleGroup: vi.fn(),
    hideKind: vi.fn(),
    hrefFor: (kind, id) => `/cases/c1/${kind === 'account' ? 'accounts' : kind}?highlight=${id}`,
    refold: vi.fn(),
    showEveryKind: vi.fn(),
    ...over,
  }
}

const labels = (groups: ReturnType<typeof buildGraphMenu>): string[] =>
  groups.flat().map((item) => item.label)

describe('buildGraphMenu', () => {
  it('names the screen the rail names, not the graph\u2019s singular noun', () => {
    expect(labels(buildGraphMenu(node(), context()))).toContain(
      'Open p.zero@meridian.example in Accounts',
    )
  })

  // A link rather than a handler, so the destination is what the item carries:
  // the status bar shows it and a middle click opens it in a tab.
  it('opens the entity\u2019s own screen, scoped to it', () => {
    const open = buildGraphMenu(node(), context()).flat().find((i) => i.id === 'open')
    expect(open?.href).toBe('/cases/c1/accounts?highlight=acc-1')
  })

  // Nothing to open is not an item that opens nothing.
  it('leaves the item out when the entity has no screen', () => {
    const groups = buildGraphMenu(node(), context({ hrefFor: () => undefined }))
    expect(labels(groups).some((l) => l.startsWith('Open '))).toBe(false)
  })

  // A folded puck stands for several records, so there is no single screen to
  // open - `entityId` is empty exactly there.
  it('offers no screen for a fold, and offers the fold instead', () => {
    const groups = buildGraphMenu(node({ count: 5, entityId: '' }), context())
    expect(labels(groups)).toEqual(['Separate these 5', 'Hide Account'])
  })

  it('offers to re-fold a group already pulled apart', () => {
    const groups = buildGraphMenu(node({ count: 5, entityId: '', unfolded: true }), context())
    expect(labels(groups)).toContain('Re-fold this group')
  })

  // Hiding an event's kind would strand every entity hanging off it, which is
  // why the chips decline it too.
  it('never offers to hide an event or a junction', () => {
    for (const kind of ['event', 'junction']) {
      expect(labels(buildGraphMenu(node({ kind, entityId: '' }), context()))).not.toContain(
        `Hide ${kind}`,
      )
    }
  })

  // Evidence has a section but no entity table, so `screenFor` carries no
  // entry and the item must not be drawn pointing nowhere.
  it('offers no screen for a kind that has none', () => {
    const groups = buildGraphMenu(node({ kind: 'evidence' }), context())
    expect(labels(groups).some((label) => label.startsWith('Open'))).toBe(false)
  })

  describe('on bare canvas', () => {
    it('offers nothing while nothing is folded or hidden', () => {
      expect(labels(buildGraphMenu(null, context()))).toEqual([])
    })

    it('offers each undo only once its control has been used', () => {
      expect(labels(buildGraphMenu(null, context({ expanded: new Set(['a']) })))).toEqual([
        'Re-fold groups',
      ])
      expect(labels(buildGraphMenu(null, context({ hidden: new Set(['account']) })))).toEqual([
        'Show every kind',
      ])
    })
  })
})
