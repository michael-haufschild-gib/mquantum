import { createContext } from 'react'

/** Visual style variant for toast notifications. */
export type ToastType = 'success' | 'error' | 'info'

/** A single toast notification with a unique id, message, and display type. */
export interface Toast {
  id: string
  message: string
  type: ToastType
}

/** Context value exposing the toast notification API to consumers. */
export interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined)
