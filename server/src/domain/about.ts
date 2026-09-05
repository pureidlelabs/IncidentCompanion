/**
 * What `GET /api/about` answers.
 */
import { z } from 'zod'

/** The response shape, published into the API reference by name. */
export const aboutSchema = z.object({
  /** `internal-dev` while no release has been cut. Not a number, on purpose. */
  version: z.string(),
  license: z.string(),
  copyright: z.string(),
  /** The product's own site. `makerUrl` is who builds it, which is not the same. */
  siteUrl: z.url(),
  makerUrl: z.url(),
  repoUrl: z.url(),
  issuesUrl: z.url(),
})

export type About = z.infer<typeof aboutSchema>
