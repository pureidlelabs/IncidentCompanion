import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import {
  bundleThroughJunctions,
  buildIncidentGraph,
  eventType,
  eventsOfCase,
  incidentNeighbours,
  momentOf,
} from './incident-graph'
import { buildEntityGraph } from './entity-graph'

/**
 * Held against `DEMO-CAMPAIGN`, measured through the same fixture the
 * entity-graph tests use. The numbers below are the whole check that the fold
 * rules do what they claim: nothing in the browser tier can see a graph that
 * hides the wrong things, because the drawing is a canvas.
 */

const entities = buildEntityGraph(campaignCase, specsFixture).nodes
const labels = [...entities.values()].map((node) => node.label)

describe('what the timeline names', () => {
  it('finds an entity reference in all but one of the entries', () => {
    // One names nothing, so it is a note about the case rather than a link in
    // it, and drawing it would put an unattached puck on the canvas. Asserted
    // as a difference rather than as two counts: both move whenever the demo
    // gains an entry, and the property is the gap of exactly one.
    const named = eventsOfCase(campaignCase, specsFixture, new Set(entities.keys()))
    expect(campaignCase.timeline).toHaveLength(88)
    expect(named).toHaveLength(campaignCase.timeline.length - 1)
  })

  it('orders offset-carrying times by the real instant, not the string', () => {
    // Carried over from the report tier, which held this for the graph's
    // entry-point pick until the client took that over: `01:00+02:00` is
    // before `00:30+00:00` however the strings sort.
    expect(momentOf('2026-01-01T01:00:00+02:00')).toBeLessThan(
      momentOf('2026-01-01T00:30:00+00:00'),
    )
  })

  it('sorts an unparseable time last rather than treating it as the epoch', () => {
    expect(momentOf('2026-07-29T03:44:12+00:00')).toBeLessThan(Infinity)
    expect(momentOf('whenever')).toBe(Infinity)
  })
})

describe('an event type is what happened, not how it was worded', () => {
  it('collapses the same act against different hosts', () => {
    expect(eventType('PsExec lateral movement to WKS-FIN01', labels)).toBe(
      eventType('PsExec lateral movement to WKS-FIN05', labels),
    )
  })

  it('keeps two genuinely different events apart', () => {
    expect(eventType('LSASS dumped with Mimikatz on FS-01', labels)).not.toBe(
      eventType('SharpHound run to map Active Directory', labels),
    )
  })

  it('leaves short names alone, or ordinary prose acquires holes', () => {
    // A three-character label must not blank every occurrence of those letters
    // in a sentence that was never naming the entity at all.
    expect(eventType('Ransom note found on the share', ['on'])).toBe(
      'Ransom note found on the share',
    )
  })
})

describe('the graph it builds', () => {
  const graph = buildIncidentGraph(campaignCase, specsFixture)
  const events = graph.nodes.filter((node) => node.kind === 'event')

  it('draws 20 kinds of event out of 87 entries', () => {
    // 18 until the campaign demo gained a persistence event and a log-clearing
    // one; the folding is what the number is about, not the number.
    expect(events).toHaveLength(20)
    expect(events.length).toBeLessThan(campaignCase.timeline.length / 4)
  })

  it('folds the repetition and says how much it folded', () => {
    const beacon = events.find((node) => node.label.includes('Cobalt Strike beacon'))
    expect(beacon?.label).toBe('+ 39  Cobalt Strike beacon check-in to C2')
    // 40 entries, one line of text: `members` dedupes for reading and `count`
    // is what the drawing needs, or the stack behind the puck never appears.
    expect(beacon?.count).toBe(40)
    expect(beacon?.members).toHaveLength(1)
  })

  it('joins two entities only where a reference is unnarrated, never as a mesh', () => {
    // The point of drawing events as nodes is that entity-to-entity edges stop
    // being invented by dissolving each entry into a star. The one exception is
    // deliberate and marked: a reference recorded on the entity itself that no
    // entry accounts for. Everything else stays bipartite.
    const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]))
    const entityToEntity = graph.links.filter(
      (link) => kindOf.get(link.src) !== 'event' && kindOf.get(link.dst) !== 'event',
    )
    expect(entityToEntity.every((link) => link.unnarrated)).toBe(true)
    // **The bound is against a mesh, and a mesh is quadratic.** It was
    // `links/10`, calibrated when the campaign demo carried no
    // indicator-to-malware reference at all; giving the eight C2 nodes and six
    // staging domains the `NetworkIndicator.malware_id` the model asks for
    // took this from 0 to 12 of 96 edges, which is correct data rather than a
    // mesh. A real mesh over 82 entities is thousands of edges, so the
    // assertion that carries the property is the one below it.
    expect(entityToEntity.length).toBeLessThan(graph.links.length / 5)
    expect(entityToEntity.length).toBeLessThan(graph.nodes.length)
  })

  it('is one connected component, so nothing is drawn adrift', () => {
    const adjacency = incidentNeighbours(graph.links)
    const seen = new Set<string>()
    const stack = [graph.nodes[0]?.id ?? '']
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined || seen.has(id)) continue
      seen.add(id)
      for (const next of adjacency.get(id) ?? []) stack.push(next)
    }
    expect(seen.size).toBe(graph.nodes.length)
  })

  it('splits what the timeline never names by whether anything reaches it', () => {
    /**
     * **The split, not the two totals.** An entity the timeline never names
     * but that reaches something narrated is a *gap in the story* and is
     * drawn; one that reaches nothing at all is scope and stays off the
     * canvas. Both sides move whenever the fixture gains a collection - impact
     * added three - and re-typing the numbers says nothing about whether the
     * split still puts each entity on the right side.
     */
    const unnarrated = graph.nodes.filter((node) => node.unnarrated)
    const drawn = unnarrated.reduce((total, node) => total + node.count, 0)

    expect(drawn, 'nothing unnarrated is drawn, so the split does nothing').toBeGreaterThan(0)
    expect(graph.disconnected.length, 'nothing is held back as scope').toBeGreaterThan(0)
    // The two sides are disjoint: an entity is a gap or it is scope, never both.
    const scope = new Set(graph.disconnected.map((node) => node.id))
    expect(unnarrated.filter((node) => scope.has(node.id))).toEqual([])
  })

  it('hangs an unnarrated entity off whatever it was recorded against', () => {
    const cdn = graph.nodes.find((node) => node.label.includes('update-cdn-1.example'))
    expect(cdn?.unnarrated).toBe(true)
    expect(cdn?.count).toBe(6)
    const anchors = graph.links
      .filter((link) => link.dst === cdn?.id)
      .map((link) => graph.nodes.find((node) => node.id === link.src)?.label)
    expect(anchors).toContain('WKS-FIN01')
    expect(graph.links.filter((link) => link.dst === cdn?.id).every((l) => l.unnarrated)).toBe(true)
  })

  it('marks the first system the case mentions as the entry point', () => {
    const entry = graph.nodes.filter((node) => node.entry)
    expect(entry).toHaveLength(1)
    expect(entry[0]?.members).toContain('WKS-FIN01')
  })
})

describe('fold the leaves, never the bridges', () => {
  const graph = buildIncidentGraph(campaignCase, specsFixture)

  it('draws every entity that joins two kinds of event on its own', () => {
    const bridges = graph.nodes.filter((node) => node.bridge)
    expect(bridges).toHaveLength(20)
    for (const bridge of bridges) expect(bridge.members).toHaveLength(1)
  })

  it('sizes a bridge by how many kinds of event it spans', () => {
    const spans = new Map(graph.nodes.filter((n) => n.bridge).map((n) => [n.label, n.spans]))
    // 9, not 8: svc-backup now also spans the log-clearing event.
    expect(spans.get('svc-backup')).toBe(9)
    // 8, not 7: WKS-FIN01 now also spans the persistence event.
    expect(spans.get('WKS-FIN01')).toBe(8)
    expect(spans.get('FS-01')).toBe(6)
  })

  it('folds a leaf that appears in one kind of event', () => {
    const staff = graph.nodes.find((node) => node.label.includes('staff01@meridian.example'))
    expect(staff?.count).toBeGreaterThan(1)
    expect(staff?.bridge).toBe(false)
  })
})

describe('folding is a choice the analyst can reverse', () => {
  it('draws the members instead once the group is expanded', () => {
    const folded = buildIncidentGraph(campaignCase, specsFixture)
    const puck = folded.nodes.find((node) => node.label.includes('Cobalt Strike beacon'))
    expect(puck?.groupKey).toBeTruthy()

    const opened = buildIncidentGraph(campaignCase, specsFixture, {
      expanded: new Set([puck?.groupKey ?? '']),
    })
    expect(opened.nodes.filter((node) => node.label.includes('Cobalt Strike beacon'))).toHaveLength(
      40,
    )
    expect(opened.nodes.every((node) => !node.label.startsWith('+ 39'))).toBe(true)
  })

  it('draws a small group as its members rather than hiding one behind a +1', () => {
    // Above the largest group in the case - 40 beacon check-ins - so nothing
    // is big enough to earn a fold and every node stands for one thing.
    const graph = buildIncidentGraph(campaignCase, specsFixture, { foldFrom: 41 })
    expect(graph.nodes.every((node) => node.count === 1)).toBe(true)
  })

  it('still folds a group at the threshold, so the knob means what it says', () => {
    const graph = buildIncidentGraph(campaignCase, specsFixture, { foldFrom: 40 })
    const folded = graph.nodes.filter((node) => node.count > 1)
    expect(folded).toHaveLength(1)
    expect(folded[0]?.label).toContain('Cobalt Strike beacon')
  })
})

describe('when each node appears, for playback', () => {
  const graph = buildIncidentGraph(campaignCase, specsFixture)

  it('gives a folded node the earliest moment of its members', () => {
    const beacon = graph.nodes.find((node) => node.label.includes('Cobalt Strike beacon'))
    const entry = graph.nodes.find((node) => node.entry)
    expect(beacon?.seen).toBeGreaterThan(entry?.seen ?? 0)
  })

  it('never shows an edge before both the nodes it joins', () => {
    // The mismatch this pins cost a whole playback: a node folded to its
    // earliest member while its edges kept the raw entity's later clock, so
    // pucks lit up with nothing attached to them.
    const seenOf = new Map(graph.nodes.map((node) => [node.id, node.seen]))
    for (const link of graph.links) {
      expect(link.seen).toBeGreaterThanOrEqual(seenOf.get(link.src) ?? Infinity)
      expect(link.seen).toBeGreaterThanOrEqual(seenOf.get(link.dst) ?? Infinity)
    }
  })
})

describe('bundling a fan through a junction', () => {
  const graph = buildIncidentGraph(campaignCase, specsFixture)

  it('replaces a fan of like edges with one stem and a split', () => {
    const bundled = bundleThroughJunctions(graph.nodes, graph.links)
    const junctions = bundled.nodes.filter((node) => node.kind === 'junction')
    expect(junctions.length).toBeGreaterThan(0)
    expect(bundled.nodes).toHaveLength(graph.nodes.length + junctions.length)
  })

  it('never cuts the graph', () => {
    // Bundling before the filters, then pruning junctions whose fan had gone,
    // turned one component into seven - a picture that lied about the case.
    const bundled = bundleThroughJunctions(graph.nodes, graph.links)
    const adjacency = incidentNeighbours(bundled.links)
    const seen = new Set<string>()
    const stack = [bundled.nodes[0]?.id ?? '']
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined || seen.has(id)) continue
      seen.add(id)
      for (const next of adjacency.get(id) ?? []) stack.push(next)
    }
    expect(seen.size).toBe(bundled.nodes.length)
  })

  it('leaves a fan too small to be worth a stem alone', () => {
    const bundled = bundleThroughJunctions(graph.nodes, graph.links, 99)
    expect(bundled.nodes.filter((node) => node.kind === 'junction')).toHaveLength(0)
    expect(bundled.links).toHaveLength(graph.links.length)
  })
})
