import {
  BugIcon,
  CloudIcon,
  FileTextIcon,
  GlobeIcon,
  MonitorIcon,
  ShieldAlertIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react'

/**
 * What each entity kind looks like and is called, keyed on the `REF_TARGETS`
 * key the specs document publishes.
 */
export const KIND_ICON: Record<string, LucideIcon> = {
  system: MonitorIcon,
  account: UserIcon,
  network: GlobeIcon,
  malware: BugIcon,
  cloud_app: CloudIcon,
  evidence: FileTextIcon,
  impact: ShieldAlertIcon,
}

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
