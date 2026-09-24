/* A dismissible, auto-hiding hint toast (level intro hint). Announced via aria-live. */
import { useEffect } from 'react'

export interface ToastProps {
  message: string
  onDismiss: () => void
  autoHideMs?: number
}

export function Toast({ message, onDismiss, autoHideMs = 6000 }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, autoHideMs)
    return () => window.clearTimeout(timer)
  }, [onDismiss, autoHideMs])

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast__message">{message}</span>
      <button type="button" className="toast__close" onClick={onDismiss} aria-label="Dismiss hint">
        ×
      </button>
    </div>
  )
}
