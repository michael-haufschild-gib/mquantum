import React from 'react'

const iconProps = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

type ColorPickerIconProps = React.SVGProps<SVGSVGElement>

export const EyeDropperIcon: React.FC<ColorPickerIconProps> = (props) => (
  <svg aria-hidden="true" focusable="false" {...iconProps} {...props}>
    <path d="M2 22l5-5 5-5 5 5-5 5-5-5z" />
    <path d="M17 7l-5 5" />
    <path d="M14 2l8 8" />
  </svg>
)

export const CopyIcon: React.FC<ColorPickerIconProps> = (props) => (
  <svg aria-hidden="true" focusable="false" {...iconProps} {...props}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)
