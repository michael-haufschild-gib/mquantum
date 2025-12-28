/**
 * Type declarations for SVG imports via vite-plugin-svgr
 * Enables importing SVGs as React components using ?react suffix
 *
 * @example
 * import IconName from '@/assets/icons/icon-name.svg?react'
 * <IconName className="w-4 h-4" />
 */
declare module '*.svg?react' {
  import type React from 'react'
  const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>
  export default ReactComponent
}
