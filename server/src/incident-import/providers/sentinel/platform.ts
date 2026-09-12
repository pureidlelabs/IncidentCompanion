/**
 * What this provider is called, wherever a row has to name where it came from.
 *
 * **One spelling, because two of them are a reporting bug rather than a typo.**
 * A timeline entry names it in `sourceTool` and an entity row in `source`; an
 * analyst filtering a case by the platform that fed it gets one section back
 * if the two ever drift apart.
 */
export const PLATFORM = 'Microsoft Sentinel'
