import React from 'react'

/** Props for image or thumbnail buttons that need direct children layout. */
export interface TileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  ariaLabel: string
  pressed?: boolean
}

export const TileButton: React.FC<TileButtonProps> = React.memo(
  ({ ariaLabel, pressed, className = '', type = 'button', children, ...props }) => (
    <button
      type={type}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={`relative overflow-hidden appearance-none bg-transparent p-0 text-left focus:outline-none focus:ring-1 focus:ring-accent/60 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
)

TileButton.displayName = 'TileButton'
