import React, { Suspense, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { soundManager } from '@/lib/audio/SoundManager'
import { useDropdownStore } from '@/stores/ui/dropdownStore'

const CanvasContextMenuContent = React.lazy(() =>
  import('@/components/layout/CanvasContextMenuContent').then((m) => ({
    default: m.CanvasContextMenuContent,
  }))
)

const DROPDOWN_ID = 'canvas-context-menu'

export const CanvasContextMenu: React.FC = React.memo(() => {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const { isOpen, openDropdown } = useDropdownStore(
    useShallow((state) => ({
      isOpen: state.openDropdownId === DROPDOWN_ID,
      openDropdown: state.openDropdown,
    }))
  )

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const isCanvas =
        target.tagName === 'CANVAS' ||
        target.id === 'canvas-container' ||
        target.closest('#canvas-container')

      if (isCanvas) {
        e.preventDefault()
        setPosition({ x: e.clientX, y: e.clientY })
        soundManager.playSwish()
        openDropdown(DROPDOWN_ID)
      }
    }

    window.addEventListener('contextmenu', handleContextMenu)
    return () => window.removeEventListener('contextmenu', handleContextMenu)
  }, [openDropdown])

  if (!isOpen) return null

  return (
    <Suspense fallback={null}>
      <CanvasContextMenuContent dropdownId={DROPDOWN_ID} position={position} />
    </Suspense>
  )
})

CanvasContextMenu.displayName = 'CanvasContextMenu'
