/**
 * What `GET /api/about` answers.
 *
 * Here rather than beside the controller so the React tier reads this type
 * through `@contract/about` instead of transcribing it.
 */
import { z } from 'zod'

export const aboutSchema = z.object({
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
