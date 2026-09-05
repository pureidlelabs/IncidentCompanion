/**
 * The campaign demo's compliance record, captured from the running Node server.
 */

import type { ComplianceRecord } from '@/api/compliance'

import raw from './compliance.json'

export const campaignCompliance = raw as unknown as ComplianceRecord
