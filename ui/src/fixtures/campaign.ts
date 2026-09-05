/**
 * The campaign demo, captured from the running Node server.
 */

import type { Case } from '@/api/model'

import raw from './campaign.json'

export const campaignCase = raw as unknown as Case
