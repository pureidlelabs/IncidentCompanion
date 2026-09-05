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
 * on it is by being on the screen the analyst is looking at. Cutting the stack
 * to a friendly sentence is what made the last one take an evening.
 *
 * **Plain markup, no design system.** A boundary that imports the component
 * library cannot render the failure where the component library is what threw.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  readonly children: ReactNode
}

interface State {
  readonly error: Error | null
  readonly stack: string
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
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>The app stopped rendering</h1>
        <p style={{ margin: '0 0 1rem', color: '#666' }}>
          Nothing was written. Reloading is safe.
        </p>
        <button type="button" onClick={() => { window.location.reload() }}>
          Reload
        </button>
        <pre
          style={{
            marginTop: '1.5rem', padding: '1rem', background: '#f5f5f5',
            color: '#900', overflow: 'auto', maxHeight: '20rem', fontSize: '0.8rem',
          }}
        >
          {error.name}: {error.message}
          {stack}
        </pre>
      </div>
    )
  }
}
