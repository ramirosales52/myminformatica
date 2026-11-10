import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'

type Notify = (text: string, error?: boolean) => void
const ToastContext = createContext<Notify>(() => {})
export const useToast = () => useContext(ToastContext)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<{ id: number; text: string; error: boolean }[]>([])
  const notify = useCallback<Notify>((text, error = false) => {
    const id = Date.now() + Math.random()
    setMessages((m) => [...m.slice(-3), { id, text, error }])
    setTimeout(() => setMessages((m) => m.filter((t) => t.id !== id)), error ? 10000 : 5000)
  }, [])
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" aria-live="polite">
        {messages.map((m) => (
          <div
            className={`toast ${m.error ? 'error' : ''}`}
            role={m.error ? 'alert' : 'status'}
            key={m.id}
          >
            {m.error ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}
            <span>{m.text}</span>
            <button
              className="icon-btn"
              aria-label="Cerrar aviso"
              onClick={() => setMessages((a) => a.filter((t) => t.id !== m.id))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
