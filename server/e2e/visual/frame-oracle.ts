/**
 * Byte-identical frames across sibling stories of one component.
 *
 * Two stories exist because somebody meant them to differ. When both render
 * the same pixels, the usual cause is one story's subject not reaching the
 * screen -- an `args` field the component never reads, a variant name that
 * was renamed on one side, a state that silently falls back to the default.
 * `storybook.spec.ts` already screenshots every story for `STORYBOOK_SHOTS`;
 * this hashes what it captures and groups the hashes by component.
 *
 * **Reports the pairs and asserts nothing**, because a cluster is not a
 * defect on its own. Three kinds are correct: a prop with no visual effect at
 * this viewport, a docs re-export of a default story, and a frame captured
 * before a spinner or a retry settles. `loadStory` waits for `storyFinished`,
 * which fires after rendering and `play` have settled, but a query that
 * refetches has nothing for it to wait on.
 *
 * **`storyFinished`'s status is not the check.** Storybook resolves it
 * `status: 'success'` whatever `play` did, a plain `throw` included. The sweep
 * keys on `playFunctionThrewException` instead, so a story whose `play` threw
 * is reported rather than hashed. A cluster here is a capture-timing artefact
 * or a prop with no visual effect, and no longer a silently failed assertion.
 */
import { createHash } from 'node:crypto'

/** One captured frame, keyed to the story and ground it came from. */
export interface FrameRecord {
  ground: string
  group: string
  title: string
  name: string
  hash: string
}

/** sha256 of a screenshot buffer, as hex. */
export function hashFrame(png: Buffer): string {
  return createHash('sha256').update(png).digest('hex')
}

/** The component a story belongs to, for grouping siblings that should differ. */
export function componentGroup(componentPath: string | undefined, title: string): string {
  return componentPath ?? title
}

export interface DuplicateCluster {
  ground: string
  group: string
  /** `title / name` for every story that shares this cluster's hash. */
  stories: string[]
}

/**
 * Every set of two or more stories, same ground and same component group,
 * whose frames hashed identical.
 *
 * A component with one story never appears -- there is no sibling to differ
 * from. Ordered by group then ground, so a rerun's output diffs cleanly.
 *
 * **The bucket key carries `ground` and `group` as a tuple, never a joined
 * string.** A joined `"${ground} ${group}"` has to be split back apart to
 * report on, and a story title with a space in it -- most of them -- puts the
 * split in the wrong place and truncates the reported group. Caught by this
 * module's own build: `"Selftest/Frame Oracle"` came back as
 * `"Selftest/Frame"`, silently, because array destructuring past the second
 * element discards the rest rather than throwing.
 */
export function duplicateClusters(records: FrameRecord[]): DuplicateCluster[] {
  const byBucket = new Map<string, { ground: string; group: string; byHash: Map<string, string[]> }>()
  for (const record of records) {
    const bucketKey = JSON.stringify([record.ground, record.group])
    let bucket = byBucket.get(bucketKey)
    if (!bucket) {
      bucket = { ground: record.ground, group: record.group, byHash: new Map() }
      byBucket.set(bucketKey, bucket)
    }
    const label = `${record.title} / ${record.name}`
    const already = bucket.byHash.get(record.hash)
    if (already) already.push(label)
    else bucket.byHash.set(record.hash, [label])
  }

  const clusters: DuplicateCluster[] = []
  for (const { ground, group, byHash } of byBucket.values()) {
    for (const stories of byHash.values()) {
      if (stories.length > 1) clusters.push({ ground, group, stories })
    }
  }
  clusters.sort((a, b) => a.group.localeCompare(b.group) || a.ground.localeCompare(b.ground))
  return clusters
}

/** One cluster as a report line. */
export function sayCluster(cluster: DuplicateCluster): string {
  return `${cluster.ground} ${cluster.group} - identical pixels: ${cluster.stories.join(' == ')}`
}
