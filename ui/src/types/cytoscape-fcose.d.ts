/** `cytoscape-fcose` ships no types. The extension is a registration
 *  function and its options travel as a layout name, so the surface this
 *  project touches is exactly this. */
declare module 'cytoscape-fcose' {
  import type { Ext } from 'cytoscape'
  const fcose: Ext
  export default fcose
}
