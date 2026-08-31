/**
 * Which ENISA severity band each GDPR obligation starts at.
 *
 * **In `domain` because both sides of it need it and neither may import the
 * other.** The lens reads a policy to reach a verdict; the install preferences
 * store one and validate it. Putting the defaults in either would make
 * `preferences` depend on `compliance` or the reverse, and the second closes a
 * cycle the moment the lens reads its floors back.
 *
 * **Settable at all because ENISA's methodology leaves the mapping to the
 * supervisory authority.** Its four bands and the Regulation's two thresholds
 * are different scales, and baking the bridge in would make the app assert one
 * authority's policy as though it were the Regulation.
 *
 * The defaults are the common reading: Article 33's "unless unlikely to result
 * in a risk" catches everything from medium up, Article 34's "high risk" from
 * high.
 */
export interface Policy {
  authorityFloor: string
  subjectsFloor: string
}

export const DEFAULT_POLICY: Policy = { authorityFloor: 'medium', subjectsFloor: 'high' }
