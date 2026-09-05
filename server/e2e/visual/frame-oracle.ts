/**
 * Byte-identical frames across sibling stories of one component.
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
