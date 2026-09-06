export const KIND_LABEL: Record<string, string> = {
  system: 'Asset',
  account: 'Account',
  network: 'Indicator',
  malware: 'Malware',
  cloud_app: 'Cloud app',
  evidence: 'Evidence',
  // The analyst's word for it, matching the rail row. The key is the wire's
  // collection name because nothing references impact, so it has no screen key.
  impact: 'Impact',
}
