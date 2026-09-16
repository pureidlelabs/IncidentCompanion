import type { CollectionName } from '@/api/model'

/** One served answer to `GET /api/collections`, reduced as a screen takes it. */
export const batchDoorsFixture: readonly CollectionName[] = [
  'accounts',
  'actions',
  'casenotes',
  'cloud_apps',
  'evidence',
  'impact',
  'malware',
  'methods',
  'network_indicators',
  'systems',
  'timeline',
]
