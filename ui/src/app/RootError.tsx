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
  /**
   * Separate from `error`, because a `throw null` is a caught failure whose
   * value is falsy: testing the value sends React back into the children,
   * which throw again, and after a few attempts it gives up and unmounts the
   * tree -- the white page this file exists to prevent.
   */
  readonly caught: boolean
  readonly error: unknown
  readonly stack: string
}

/** What was thrown, in one line, for anything throwable rather than an `Error`. */
function lineOf(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
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
function Bare({ detail }: { detail: string }) {
  return (
    // The sweep reads this: a run with the kit broken and the fallback on
    // screen would otherwise record a clean pass. -> `complaints()`
    <div data-testid="root-error">
      <h1>The app stopped rendering</h1>
      <p>Nothing was written. Reloading is safe.</p>
      <button type="button" onClick={reload}>
        Reload
      </button>
      <pre>{detail}</pre>
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
  override state: State = { caught: false, error: null, stack: '' }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { caught: true, error }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The component stack says *where*, which the message alone never does.
    this.setState({ stack: info.componentStack ?? '' })
    console.error('the app stopped rendering', error, info.componentStack)
  }

  override render(): ReactNode {
    const { caught, error, stack } = this.state
    if (!caught) return this.props.children

    const detail = lineOf(error)
    return (
      <IfTheDrawingThrewToo instead={<Bare detail={detail} />}>
        <RootErrorScreen stack={`${detail}\n${stack}`} onReload={reload} />
      </IfTheDrawingThrewToo>
    )
  }
}
