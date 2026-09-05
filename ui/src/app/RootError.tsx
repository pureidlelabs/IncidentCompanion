/**
 * The last boundary. Everything else in the tree is inside it.
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
