import { useContext } from 'react'
import { ToastContext } from '@/contexts/ToastContextInstance'

/**
 * Hook to access toast notifications
 * @returns Toast context with addToast function
 */
export const useToast = () => {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
