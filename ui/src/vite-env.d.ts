/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set only by the evaluation build; the tree it was built from. */
  readonly VITE_DEMO?: string
  /** Set only by the evaluation build; shown in its build stamp. */
  readonly VITE_DEMO_BUILD?: string
}
