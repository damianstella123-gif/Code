import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/theme.css'
import './index.css'
import { initTheme, ThemeProvider } from './lib/theme'
import { ToastProvider } from './lib/toast'

initTheme()

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#fff', background: '#1a1a1a', minHeight: '100vh' }}>
          <h1 style={{ color: '#d0003a' }}>Errore di caricamento</h1>
          <p>Si e' verificato un errore. Ricarica la pagina.</p>
          <pre style={{ fontSize: 12, opacity: 0.7, marginTop: 16 }}>{this.state.error}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', background: '#d0003a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Ricarica
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const reg of registrations) {
        reg.update()
      }
    })
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  })
}
