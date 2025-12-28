import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';

export const useDynamicFavicon = () => {
  const accent = useThemeStore((state) => state.accent);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Get accent color from computed style or mapping
      let color = '#3b82f6'; // Default blue
      
      const accentColors: Record<string, string> = {
          cyan: '#06b6d4',
          green: '#10b981',
          magenta: '#d946ef',
          orange: '#f97316',
          blue: '#3b82f6',
          violet: '#8b5cf6',
          red: '#ef4444'
      };
      
      if (accent in accentColors) {
          color = accentColors[accent] || color;
      }

      // Draw Circle
      ctx.clearRect(0, 0, 32, 32);
      ctx.beginPath();
      ctx.arc(16, 16, 12, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Draw Glow
      ctx.shadowBlur = 4;
      ctx.shadowColor = color;
      ctx.stroke();

      // Update existing favicon link or create new one (avoid DOM pollution)
      const existingLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (existingLink) {
        // Update existing link
        existingLink.href = canvas.toDataURL();
      } else {
        // Create new link only if none exists
        const newLink = document.createElement('link');
        newLink.type = 'image/x-icon';
        newLink.rel = 'shortcut icon';
        newLink.href = canvas.toDataURL();
        document.head.appendChild(newLink);
      }
    }
  }, [accent]);
};
