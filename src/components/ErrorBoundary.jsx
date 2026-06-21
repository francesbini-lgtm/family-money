import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '32px', maxWidth: 700,
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{
            background: '#fff0f0', border: '1px solid #ffaaaa',
            borderRadius: 10, padding: '20px 24px', marginBottom: 16
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#c83030', marginBottom: 8 }}>
              ⚠️ Errore in questa sezione
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              {this.state.error?.message || 'Errore sconosciuto'}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null, info: null })}
              style={{
                padding: '7px 16px', background: '#c8622a', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 13, fontWeight: 600
              }}
            >
              Riprova
            </button>
          </div>
          <details style={{ fontSize: 11, color: '#999' }}>
            <summary style={{ cursor: 'pointer' }}>Dettagli tecnici</summary>
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.error?.stack}
              {'\n\n'}
              {this.state.info?.componentStack}
            </pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}
