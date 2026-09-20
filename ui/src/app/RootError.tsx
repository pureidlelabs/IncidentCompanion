/**
 * The last boundary. Everything else in the tree is inside it.
 *
 * **A white page is never an acceptable failure**, and it was the only one
 * available above the router: `routes.tsx` gives every route an `errorElement`,
 * but a throw in `App`, in the session hooks, or in a provider happens
 * *outside* the router and React unmounts the whole tree. The analyst sees
 * nothing at all - no message, no reload affordance, and nothing in the network
 * panel, because the failure is not a request.
 *
 * **It renders the error, not an apology.** This is a local-first tool with no
 * crash reporting behind it, so the only way a fault reaches anyone who can act
 * on it is by being on the screen the analyst is looking at.
 *
 * The drawing is `screens/route-error.tsx`, which is what lets the gallery show
 * a screen that by construction only appears when something has gone wrong.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { RootErrorScreen } from '@/screens/route-error'

interface Props {
  readonly children: ReactNode
}

interface State {
  readonly error: Error | null
  readonly stack: string
}

const reload = () => {
  window.location.reload()
}

/**
 * The failure, in markup that depends on nothing.
 *
 * Unstyled on purpose rather than by neglect: it is reached only when drawing
 * the designed screen threw as well, and anything it reached for to look
 * better is a second thing that can be the thing that is broken.
 */
function Bare({ error }: { error: Error }) {
  return (
    <div>
      <h1>The app stopped rendering</h1>
      <p>Nothing was written. Reloading is safe.</p>
      <button type="button" onClick={reload}>
        Reload
      </button>
      <pre>
        {error.name}: {error.message}
      </pre>
    </div>
  )
}

/**
 * Draws `children`, or `instead` when drawing them throws.
 *
 * A boundary cannot catch a throw from its own render, so the designed screen
 * needs one of its own: the kit is a plausible thing to have been what threw,
 * and a fallback that dies rendering the fallback is the white page again.
 */
class IfTheDrawingThrewToo extends Component<
  { readonly children: ReactNode; readonly instead: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.instead : this.props.children
  }
}

export class RootError extends Component<Props, State> {
  override state: State = { error: null, stack: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The component stack says *where*, which the message alone never does.
    this.setState({ stack: info.componentStack ?? '' })
    console.error('the app stopped rendering', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error, stack } = this.state
    if (!error) return this.props.children

    return (
      <IfTheDrawingThrewToo instead={<Bare error={error} />}>
        <RootErrorScreen stack={`${error.name}: ${error.message}\n${stack}`} onReload={reload} />
      </IfTheDrawingThrewToo>
    )
  }
}
