import React, { useRef, useState, useEffect } from 'react';

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({ 
  children, 
  className = '',
  spotlightColor = 'rgba(255, 255, 255, 0.1)'
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [opacity, setOpacity] = useState(0);
  
  useEffect(() => {
    const div = divRef.current;
    if (!div) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Use offset properties directly from event when possible for best performance
      // This avoids getBoundingClientRect() calls
      let x, y;
      
      if (e.target === div || div.contains(e.target as Node)) {
          // If event target is inside, use bounding client rect only if necessary
          // For maximum perf, we can assume e.clientX relative to viewport
          const rect = div.getBoundingClientRect();
          x = e.clientX - rect.left;
          y = e.clientY - rect.top;
          
          div.style.setProperty('--spotlight-x', `${x}px`);
          div.style.setProperty('--spotlight-y', `${y}px`);
      }
    };

    div.addEventListener('mousemove', handleMouseMove);
    return () => div.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleMouseEnter = () => {
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      ref={divRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-xl border border-border-default bg-[var(--bg-hover)] ${className}`}
      style={{
          '--spotlight-color': spotlightColor,
      } as React.CSSProperties}
    >
      <div
        className="pointer-events-none absolute -inset-px transition duration-300"
        style={{
          opacity,
          background: `radial-gradient(600px circle at var(--spotlight-x, 0px) var(--spotlight-y, 0px), var(--spotlight-color), transparent 40%)`,
        }}
      />
      <div className="relative h-full">
          {children}
      </div>
    </div>
  );
};