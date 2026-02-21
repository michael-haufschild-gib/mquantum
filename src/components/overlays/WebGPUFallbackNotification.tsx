/**
 * WebGPU Fallback Notification
 *
 * Displayed when WebGPU is unavailable.
 * Provides information about why WebGPU isn't available and can be dismissed.
 *
 * @module components/overlays/WebGPUFallbackNotification
 */

import React, { useEffect, useState } from 'react'
import { useRendererStore } from '@/stores/rendererStore'
import { Button } from '@/components/ui/Button'
import { Z_INDEX } from '@/constants/zIndex'

// ============================================================================
// Component
// ============================================================================

/**
 * Notification banner shown when WebGPU is unavailable.
 * Auto-dismisses after a timeout or can be manually dismissed.
 */
export const WebGPUFallbackNotification: React.FC = () => {
  const showNotification = useRendererStore((state) => state.showFallbackNotification)
  const capabilities = useRendererStore((state) => state.webgpuCapabilities)
  const dismissNotification = useRendererStore((state) => state.dismissFallbackNotification)

  const [isVisible, setIsVisible] = useState(false)

  // Animate in when shown
  useEffect(() => {
    if (showNotification) {
      // Small delay for mount animation
      const timer = setTimeout(() => setIsVisible(true), 50)
      return () => clearTimeout(timer)
    }
    const hideTimer = window.setTimeout(() => setIsVisible(false), 0)
    return () => clearTimeout(hideTimer)
  }, [showNotification])

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (showNotification) {
      const timer = setTimeout(() => {
        dismissNotification()
      }, 8000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [showNotification, dismissNotification])

  if (!showNotification) {
    return null
  }

  // Determine reason message
  let reasonMessage = 'WebGPU is not available on your device.'
  if (capabilities?.unavailableReason) {
    switch (capabilities.unavailableReason) {
      case 'not_in_browser':
        reasonMessage = 'Your browser does not support WebGPU.'
        break
      case 'no_adapter':
        reasonMessage = 'No compatible GPU adapter found.'
        break
      case 'device_lost':
        reasonMessage = 'The GPU device was lost and could not recover.'
        break
      case 'initialization_error':
        reasonMessage = 'WebGPU failed to initialize.'
        break
    }
  }

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: `translateX(-50%) translateY(${isVisible ? 0 : 20}px)`,
        opacity: isVisible ? 1 : 0,
        transition: 'all 0.3s ease-out',
        zIndex: Z_INDEX.TOOLTIP,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 4px 12px var(--bg-overlay)',
        maxWidth: '90vw',
      }}
    >
      {/* Info icon */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        style={{ flexShrink: 0, color: 'var(--text-warning)' }}
      >
        <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 6v5M10 14h.01"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          WebGPU unavailable
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
          {reasonMessage}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={dismissNotification}
        style={{ padding: '4px 8px', minWidth: 'auto' }}
      >
        Dismiss
      </Button>
    </div>
  )
}

export default WebGPUFallbackNotification
