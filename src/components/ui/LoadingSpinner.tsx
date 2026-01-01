import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = React.memo(({
  size = 16,
  color = 'currentColor',
  className = ''
}) => {
  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-live="polite" aria-label="Loading">
      <svg aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        className="animate-spin"
        style={{ color }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          className="opacity-20"
        />
        <path
          d="M12 2C6.47715 2 2 6.47715 2 12C2 12.6667 2.1 13.3 2.2 13.9"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';
