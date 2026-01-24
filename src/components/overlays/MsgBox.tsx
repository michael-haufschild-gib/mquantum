import React, { useState, useEffect } from 'react'
import { useMsgBoxStore } from '@/stores/msgBoxStore'
import { useDismissedDialogsStore } from '@/stores/dismissedDialogsStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'

export const MsgBox: React.FC = () => {
  const { isOpen, title, message, type, actions, dismissible, dismissId, closeMsgBox } =
    useMsgBoxStore()
  const dismiss = useDismissedDialogsStore((state) => state.dismiss)

  // Local state for the "don't show again" checkbox
  const [dontShowAgain, setDontShowAgain] = useState(false)

  // Reset checkbox state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setDontShowAgain(false)
    }
  }, [isOpen])

  /**
   * Handles action button click.
   * If checkbox is checked, persists the dismiss state before executing the action.
   */
  const handleAction = (action: { onClick: () => void }) => {
    if (dontShowAgain && dismissId) {
      dismiss(dismissId)
    }
    action.onClick()
  }

  const getIcon = (): IconName => {
    switch (type) {
      case 'error':
        return 'warning' // We use 'warning' icon for error as it's the triangle exclamation
      case 'warning':
        return 'warning'
      case 'success':
        return 'check'
      case 'info':
      default:
        return 'info'
    }
  }

  const getColorClass = () => {
    switch (type) {
      case 'error':
        return 'text-danger'
      case 'warning':
        return 'text-warning'
      case 'success':
        return 'text-success'
      case 'info':
      default:
        return 'text-accent'
    }
  }

  const getBgClass = () => {
    switch (type) {
      case 'error':
        return 'bg-danger-bg border-danger-border'
      case 'warning':
        return 'bg-warning-bg border-warning-border'
      case 'success':
        return 'bg-success-bg border-success-border'
      case 'info':
      default:
        return 'bg-accent-subtle border-accent-muted'
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={closeMsgBox} title={title} width="max-w-md">
      <div className="space-y-6">
        <div className={`flex items-start gap-4 p-4 rounded-xl border ${getBgClass()}`}>
          <div className={`shrink-0 p-2 rounded-full bg-[var(--bg-hover)] ${getColorClass()}`}>
            <Icon name={getIcon()} size={24} />
          </div>
          <div className="flex-1">
            <p
              id="msgbox-message"
              className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed"
            >
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          {/* "Don't show again" checkbox - only shown when dismissible */}
          {dismissible && dismissId ? (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 rounded border-panel-border bg-bg-input accent-[var(--accent)] cursor-pointer"
                aria-describedby="msgbox-message"
              />
              <span className="text-text-secondary group-hover:text-text-primary transition-colors">
                Don't show again
              </span>
            </label>
          ) : (
            <div /> // Spacer to keep buttons right-aligned
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            {actions.map((action, index) => (
              <Button
                key={index}
                onClick={() => handleAction(action)}
                variant={action.variant || 'secondary'}
                size="md"
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
