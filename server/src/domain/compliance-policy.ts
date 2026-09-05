/**
 * Which ENISA severity band each GDPR obligation starts at.
 */
export interface Policy {
  authorityFloor: string
  subjectsFloor: string
}

export const DEFAULT_POLICY: Policy = { authorityFloor: 'medium', subjectsFloor: 'high' }
