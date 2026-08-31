/**
 * What `GET /api/about` answers.
 *
 * Here rather than beside the controller so the React tier reads this type
 * through `@contract/about` instead of transcribing it. The client held its
 * own `AboutInfo` interface until this moved, which is the shape every other
 * route already stopped having.
 */
import { z } from 'zod'

/** The response shape, published into the API reference by name. */
export const aboutSchema = z.object({
  /** `internal-dev` while no release has been cut. Not a number, on purpose. */
  version: z.string(),
  license: z.string(),
  copyright: z.string(),
  siteUrl: z.url(),
  repoUrl: z.url(),
  issuesUrl: z.url(),
})

export type About = z.infer<typeof aboutSchema>
