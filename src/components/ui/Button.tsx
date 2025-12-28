import React, { useRef, useState, useEffect } from 'react';
import { m, HTMLMotionProps } from 'motion/react';
import { LoadingSpinner } from './LoadingSpinner';
import { soundManager } from '@/lib/audio/SoundManager';

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  'data-testid'?: string;
  glow?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
  ariaLabel,
  'data-testid': testId,
  glow = false,
  ...props
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  
  // Ripple State
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const rippleTimersRef = useRef<Set<number>>(new Set());

  // Cleanup ripple timers on unmount
  useEffect(() => {
    const timers = rippleTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    
    // Sound
    soundManager.playClick();

    // Ripple
    const rect = e.currentTarget.getBoundingClientRect();
    const rippleX = e.clientX - rect.left;
    const rippleY = e.clientY - rect.top;
    const newRipple = { x: rippleX, y: rippleY, id: Date.now() };
    
    setRipples((prev) => [...prev, newRipple]);
    const timer = window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
        rippleTimersRef.current.delete(timer);
    }, 600);
    rippleTimersRef.current.add(timer);

    onClick?.(e);
  };

  const baseStyles = 'relative overflow-hidden font-medium rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors gap-2';

  // We rely on our new CSS utilities for the heavy lifting of gradients and shadows
  const variantStyles = {
    primary: 'glass-button-primary text-white',
    secondary: 'glass-button text-text-primary',
    ghost: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--bg-hover)]',
    danger: 'bg-[var(--bg-danger)] text-[var(--text-danger)] border border-[var(--border-danger)] hover:bg-[var(--bg-danger)] hover:brightness-110 shadow-[0_0_15px_var(--bg-danger)]'
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
    icon: 'p-2'
  };

  const glowStyle = glow ? 'shadow-[0_0_25px_var(--color-accent)] ring-1 ring-accent/50' : '';

  return (
    <m.button
      ref={ref}
      type={type}
      onClick={handleClick}
      disabled={disabled || loading}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${glowStyle} ${className}`}
      aria-label={ariaLabel}
      data-testid={testId}
      whileHover={!disabled && !loading ? { scale: 1.02, filter: 'brightness(1.1)' } : undefined}
      whileTap={!disabled && !loading ? { scale: 0.96 } : undefined}
      {...props}
    >
      {/* Loading State Overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-inherit backdrop-blur-[1px] z-20">
          <LoadingSpinner size={size === 'sm' ? 12 : 16} />
        </div>
      )}
      
      {/* Ripples */}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="absolute rounded-full bg-[var(--bg-active)] animate-ping pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: '20px',
            height: '20px',
            transform: 'translate(-50%, -50%)',
            animationDuration: '0.6s'
          }}
        />
      ))}
      
      {/* Content - faded when loading */}
      <div className={`flex items-center justify-center gap-2 ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity relative z-10`}>
        {children}
      </div>

      {/* Subtle shine effect on top for primary (kept for extra pop) */}
      {variant === 'primary' && (
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-50 pointer-events-none" />
      )}
    </m.button>
  );
};
