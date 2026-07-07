import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  type: 'error' | 'success' | 'info'
}

interface ToastContextValue {
  showToast: (message: string, type?: 'error' | 'success' | 'info') => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: 'error' | 'success' | 'info' = 'error') => {
    const id = nextId++
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 360,
        }}>
          {toasts.map(t => (
            <div
              key={t.id}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: t.type === 'error' ? '#fff' : t.type === 'success' ? '#fff' : 'var(--text)',
                background: t.type === 'error' ? 'rgba(220,38,38,0.92)' : t.type === 'success' ? 'rgba(22,163,74,0.92)' : 'var(--panel-solid)',
                border: t.type === 'info' ? '1px solid var(--line)' : 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                animation: 'toastSlideIn 0.25s ease-out',
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
